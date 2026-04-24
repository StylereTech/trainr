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

// GET /api/admin/users — List all users with filters
export async function GET(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '20')
  const role = searchParams.get('role') || undefined
  const search = searchParams.get('search') || undefined

  const where: any = {}
  if (role) where.role = role
  if (search) {
    where.OR = [
      { email: { contains: search, mode: 'insensitive' } },
      { trainerProfile: { firstName: { contains: search, mode: 'insensitive' } } },
      { trainerProfile: { lastName: { contains: search, mode: 'insensitive' } } },
    ]
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        role: true,
        image: true,
        createdAt: true,
        updatedAt: true,
        emailVerified: true,
        parentProfile: {
          select: {
            id: true,
            phone: true,
            city: true,
            state: true,
            zipCode: true,
            _count: { select: { athletes: true, bookings: true } },
          },
        },
        trainerProfile: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            approvalStatus: true,
            isActive: true,
            sports: { include: { sport: true } },
            _count: { select: { bookings: true, reviews: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count({ where }),
  ])

  return NextResponse.json({
    users,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  })
}

// PATCH /api/admin/users — Update user (change role, ban, etc.)
export async function PATCH(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const adminUserId = session.user.id
  const body = await req.json()
  const { userId, action, role } = body

  if (!userId) return NextResponse.json({ error: 'User ID required' }, { status: 400 })

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  if (action === 'change_role' && role) {
    const validRoles = ['PARENT', 'TRAINER', 'ADMIN']
    if (!validRoles.includes(role)) return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    if (user.role === 'ADMIN' && role !== 'ADMIN') {
      const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } })
      if (adminCount <= 1) return NextResponse.json({ error: 'Cannot remove the last admin' }, { status: 400 })
    }
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { role },
      select: {
        id: true,
        email: true,
        role: true,
        image: true,
        createdAt: true,
        updatedAt: true,
        emailVerified: true,
      },
    })
    await prisma.adminAction.create({
      data: {
        adminUserId,
        actionType: 'CHANGE_ROLE',
        targetType: 'USER',
        targetId: userId,
        description: `Changed role from ${user.role} to ${role}`,
        metadata: { previousRole: user.role, newRole: role },
      },
    })
    return NextResponse.json(updated)
  }

  if (action === 'delete') {
    await prisma.user.delete({ where: { id: userId } })
    await prisma.adminAction.create({
      data: {
        adminUserId,
        actionType: 'DELETE_USER',
        targetType: 'USER',
        targetId: userId,
        description: `Deleted user ${user.email}`,
      },
    })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
