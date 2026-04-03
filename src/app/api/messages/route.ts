import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const userId = session.user.id
    const { searchParams } = new URL(req.url)
    const threadId = searchParams.get('threadId')

    if (threadId) {
      // Get messages for a thread
      const thread = await prisma.messageThread.findFirst({
        where: { id: threadId, OR: [{ participantAId: userId }, { participantBId: userId }] },
      })
      if (!thread) return NextResponse.json({ error: 'Thread not found' }, { status: 404 })

      const messages = await prisma.message.findMany({
        where: { threadId },
        include: { sender: { select: { id: true, email: true } } },
        orderBy: { createdAt: 'asc' },
      })

      // Mark unread as read
      await prisma.message.updateMany({
        where: { threadId, senderId: { not: userId }, readAt: null },
        data: { readAt: new Date() },
      })

      return NextResponse.json({ thread, messages, currentUserId: userId })
    }

    // Get all threads
    const threads = await prisma.messageThread.findMany({
      where: { OR: [{ participantAId: userId }, { participantBId: userId }], isActive: true },
      include: {
        participantA: { select: { id: true, email: true } },
        participantB: { select: { id: true, email: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        _count: { select: { messages: { where: { senderId: { not: userId }, readAt: null } } } },
      },
      orderBy: { lastMessageAt: 'desc' },
    })

    return NextResponse.json({ threads, currentUserId: userId })
  } catch (error) {
    console.error('Messages GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 })
  }
}

const messageSchema = z.object({ content: z.string().min(1).max(2000), recipientId: z.string().optional(), threadId: z.string().optional() })

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const userId = session.user.id
    const body = await req.json()
    const data = messageSchema.parse(body)

    let threadId = data.threadId

    // Create thread if needed
    if (!threadId && data.recipientId) {
      // Check if thread exists
      const existing = await prisma.messageThread.findFirst({
        where: {
          OR: [
            { participantAId: userId, participantBId: data.recipientId },
            { participantAId: data.recipientId, participantBId: userId },
          ],
        },
      })

      if (existing) {
        threadId = existing.id
      } else {
        const thread = await prisma.messageThread.create({
          data: { participantAId: userId, participantBId: data.recipientId },
        })
        threadId = thread.id
      }
    }

    if (!threadId) return NextResponse.json({ error: 'Thread ID or recipient required' }, { status: 400 })

    // Verify user is in thread
    const thread = await prisma.messageThread.findFirst({
      where: { id: threadId, OR: [{ participantAId: userId }, { participantBId: userId }] },
    })
    if (!thread) return NextResponse.json({ error: 'Thread not found' }, { status: 404 })

    const message = await prisma.message.create({
      data: {
        threadId,
        senderId: userId,
        content: data.content,
      },
      include: { sender: { select: { id: true, email: true } } },
    })

    // Update thread
    await prisma.messageThread.update({
      where: { id: threadId },
      data: { lastMessageAt: new Date() },
    })

    // Create notification for recipient
    const recipientId = thread.participantAId === userId ? thread.participantBId : thread.participantAId
    await prisma.notification.create({
      data: {
        userId: recipientId,
        type: 'NEW_MESSAGE',
        title: 'New Message',
        message: data.content.substring(0, 100),
        data: { threadId },
      },
    })

    return NextResponse.json(message, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.errors[0].message }, { status: 400 })
    console.error('Message POST error:', error)
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
  }
}
