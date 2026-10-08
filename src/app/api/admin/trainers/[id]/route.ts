import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { applyTrainerAdminAction, TrainerAdminActionError, trainerAdminActionSchema } from '@/lib/trainer-admin-actions'

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

  try {
    const input = trainerAdminActionSchema.safeParse(await req.json().catch(() => null))
    if (!input.success) return NextResponse.json({ error: 'A valid decision and current profile revision are required' }, { status: 400 })
    const { id } = await params
    return NextResponse.json(await applyTrainerAdminAction(id, session.user.id, input.data))
  } catch (error) {
    if (error instanceof TrainerAdminActionError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Trainer approval transaction failed')
    return NextResponse.json({ error: 'Unable to save the trainer decision. Reload before retrying.' }, { status: 503 })
  }
}
