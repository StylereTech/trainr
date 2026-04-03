import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return null
  if (session.user.role !== 'ADMIN') return null
  return session
}

// GET /api/admin/trainers/[id] — Get single trainer detail
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const trainer = await prisma.trainerProfile.findUnique({
    where: { id },
    include: {
      user: { select: { email: true, createdAt: true, image: true } },
      sports: { include: { sport: true } },
      specialties: { include: { specialty: true } },
      certifications: true,
      serviceOfferings: true,
      packages: { include: { items: { include: { serviceOffering: true } } } },
      assets: true,
      reviews: {
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: { parentProfile: { include: { user: { select: { email: true } } } } },
      },
      _count: { select: { bookings: true, reviews: true, favorites: true } },
    },
  })

  if (!trainer) return NextResponse.json({ error: 'Trainer not found' }, { status: 404 })
  return NextResponse.json(trainer)
}

// PATCH /api/admin/trainers/[id] — Approve / Reject / Suspend
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const adminUserId = session.user.id
  const { id } = await params
  const body = await req.json()
  const { action, reason, featured, isActive } = body

  const trainer = await prisma.trainerProfile.findUnique({
    where: { id },
    include: { user: true },
  })
  if (!trainer) return NextResponse.json({ error: 'Trainer not found' }, { status: 404 })

  let updateData: any = {}

  if (action === 'approve') {
    updateData.approvalStatus = 'APPROVED'
    updateData.approvedAt = new Date()
    updateData.rejectedReason = null
  } else if (action === 'reject') {
    if (!reason) return NextResponse.json({ error: 'Reason required for rejection' }, { status: 400 })
    updateData.approvalStatus = 'REJECTED'
    updateData.rejectedReason = reason
  } else if (action === 'suspend') {
    if (!reason) return NextResponse.json({ error: 'Reason required for suspension' }, { status: 400 })
    updateData.approvalStatus = 'SUSPENDED'
    updateData.rejectedReason = reason
  } else if (action === 'feature') {
    updateData.featured = featured ?? true
  } else if (action === 'toggle_active') {
    updateData.isActive = isActive ?? !trainer.isActive
  } else {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  const updated = await prisma.trainerProfile.update({
    where: { id },
    data: updateData,
  })

  // Log admin action
  await prisma.adminAction.create({
    data: {
      adminUserId,
      actionType: action,
      targetType: 'TRAINER',
      targetId: id,
      description: `${action} trainer ${trainer.firstName} ${trainer.lastName}`,
      metadata: { reason: reason || null, previousStatus: trainer.approvalStatus },
    },
  })

  // Notify trainer
  const notificationMessages: Record<string, { title: string; message: string }> = {
    approve: { title: 'Application Approved! 🎉', message: 'Your trainer application has been approved. You can now start receiving bookings!' },
    reject: { title: 'Application Update', message: `Your trainer application was not approved. Reason: ${reason}` },
    suspend: { title: 'Account Suspended', message: `Your account has been suspended. Reason: ${reason}` },
  }

  if (notificationMessages[action]) {
    await prisma.notification.create({
      data: {
        userId: trainer.userId,
        type: `TRAINER_${action.toUpperCase()}`,
        title: notificationMessages[action].title,
        message: notificationMessages[action].message,
        data: { trainerId: id, action },
      },
    })
  }

  return NextResponse.json(updated)
}
