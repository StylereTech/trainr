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

// GET /api/admin/disputes — List moderation reports / disputes
export async function GET(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '20')
  const status = searchParams.get('status') || undefined
  const entityType = searchParams.get('entityType') || undefined

  const where: any = {}
  if (status) where.status = status
  if (entityType) where.entityType = entityType

  const [reports, total] = await Promise.all([
    prisma.moderationReport.findMany({
      where,
      include: {
        reporter: { select: { email: true } },
        resolver: { select: { email: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.moderationReport.count({ where }),
  ])

  return NextResponse.json({
    reports,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  })
}

// PATCH /api/admin/disputes — Resolve / dismiss a dispute
export async function PATCH(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const adminUserId = session.user.id
  const body = await req.json()
  const { reportId, action, resolution } = body

  if (!reportId || !action) return NextResponse.json({ error: 'reportId and action required' }, { status: 400 })

  const report = await prisma.moderationReport.findUnique({ where: { id: reportId } })
  if (!report) return NextResponse.json({ error: 'Report not found' }, { status: 404 })

  const statusMap = {
    resolve: 'RESOLVED',
    dismiss: 'DISMISSED',
    reviewing: 'REVIEWING',
  } as const

  if (!statusMap[action]) return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

  const updated = await prisma.moderationReport.update({
    where: { id: reportId },
    data: {
      status: statusMap[action],
      resolution: resolution || null,
      resolvedBy: adminUserId,
      resolvedAt: new Date(),
    },
  })

  await prisma.adminAction.create({
    data: {
      adminUserId,
      actionType: `DISPUTE_${action.toUpperCase()}`,
      targetType: 'MODERATION_REPORT',
      targetId: reportId,
      description: `${action} report: ${report.reason}`,
      metadata: { resolution: resolution || null },
    },
  })

  return NextResponse.json(updated)
}

// POST /api/admin/disputes — Create a new moderation report (admin-initiated)
export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const adminUserId = session.user.id
  const body = await req.json()
  const { reportedUserId, entityType, entityId, reason, description } = body

  if (!entityType || !entityId || !reason) {
    return NextResponse.json({ error: 'entityType, entityId, and reason required' }, { status: 400 })
  }

  const report = await prisma.moderationReport.create({
    data: {
      reporterId: adminUserId,
      reportedUserId: reportedUserId || null,
      entityType,
      entityId,
      reason,
      description: description || null,
      status: 'REVIEWING',
    },
  })

  return NextResponse.json(report, { status: 201 })
}
