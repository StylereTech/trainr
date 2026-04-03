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

// GET /api/admin/settings — Get fee configuration
export async function GET(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const configs = await prisma.feeConfig.findMany({
    orderBy: { effectiveDate: 'desc' },
    take: 10,
  })

  const active = await prisma.feeConfig.findFirst({
    where: { isActive: true },
    orderBy: { effectiveDate: 'desc' },
  })

  return NextResponse.json({ configs, active })
}

// POST /api/admin/settings — Update fee configuration
export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const adminUserId = session.user.id
  const body = await req.json()
  const { platformCommissionPercent, stripeFeePercent, processingFeeCents, minBookingAmountCents } = body

  // Deactivate previous configs
  await prisma.feeConfig.updateMany({
    where: { isActive: true },
    data: { isActive: false },
  })

  const newConfig = await prisma.feeConfig.create({
    data: {
      platformCommissionPercent: platformCommissionPercent ?? 15.0,
      stripeFeePercent: stripeFeePercent ?? 2.9,
      processingFeeCents: processingFeeCents ?? 30,
      minBookingAmountCents: minBookingAmountCents ?? 1500,
      isActive: true,
      effectiveDate: new Date(),
    },
  })

  await prisma.adminAction.create({
    data: {
      adminUserId,
      actionType: 'UPDATE_SETTINGS',
      targetType: 'FEE_CONFIG',
      targetId: newConfig.id,
      description: 'Updated fee configuration',
      metadata: body,
    },
  })

  return NextResponse.json(newConfig, { status: 201 })
}
