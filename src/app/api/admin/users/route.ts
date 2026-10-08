import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { getServerSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { adminUserFields, applyUserAdminAction, userAdminActionSchema, UserAdminActionError } from '@/lib/user-admin-actions'

const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  role: z.enum(['PARENT', 'TRAINER', 'ADMIN']).optional(),
  search: z.string().trim().max(200).optional(),
}).strict()

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user || session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams))
    if (!parsed.success) return NextResponse.json({ error: 'Invalid user-list filters' }, { status: 400 })
    const { page, limit, role, search } = parsed.data
    const where: Prisma.UserWhereInput = { ...(role ? { role } : {}),
      ...(search ? { OR: [
        { email: { contains: search, mode: 'insensitive' } },
        { trainerProfile: { firstName: { contains: search, mode: 'insensitive' } } },
        { trainerProfile: { lastName: { contains: search, mode: 'insensitive' } } },
      ] } : {}) }
    const [users, total] = await prisma.$transaction([
      prisma.user.findMany({ where, select: { ...adminUserFields,
        parentProfile: { select: { id: true, _count: { select: { athletes: true, bookings: true } } } },
        trainerProfile: { select: { id: true, firstName: true, lastName: true, approvalStatus: true, isActive: true,
          sports: { include: { sport: true } }, _count: { select: { bookings: true, reviews: true } } } },
      }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit }),
      prisma.user.count({ where }),
    ], { isolationLevel: 'RepeatableRead' })
    return NextResponse.json({ users, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } })
  } catch {
    console.error('Administrator user-list query failed')
    return NextResponse.json({ error: 'Unable to load users. Please retry.' }, { status: 503 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user || session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    let body: unknown
    try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
    const parsed = userAdminActionSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Invalid account action. Reload and check the required fields.' }, { status: 400 })
    return NextResponse.json(await applyUserAdminAction(session.user.id, parsed.data))
  } catch (error) {
    if (error instanceof UserAdminActionError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Administrator account transaction failed')
    return NextResponse.json({ error: 'Unable to confirm this change. Reload before trying again.' }, { status: 503 })
  }
}
