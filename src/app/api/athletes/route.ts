import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const athleteSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  dateOfBirth: z.string().min(1),
  gender: z.enum(['MALE', 'FEMALE', 'NON_BINARY', 'PREFER_NOT_TO_SAY']).optional(),
  skillLevel: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']).default('BEGINNER'),
  sports: z.array(z.string()).min(1),
  goals: z.array(z.string()).optional(),
  notes: z.string().optional(),
})

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const userId = session.user.id
    const parent = await prisma.parentProfile.findUnique({ where: { userId } })
    if (!parent) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    const athletes = await prisma.athleteProfile.findMany({
      where: { parentProfileId: parent.id },
      include: { sports: { include: { sport: true } } },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ athletes })
  } catch (error) {
    console.error('Get athletes error:', error)
    return NextResponse.json({ error: 'Failed to fetch athletes' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const userId = session.user.id
    const role = session.user.role
    if (role !== 'PARENT') return NextResponse.json({ error: 'Only parents can create athletes' }, { status: 403 })

    const body = await req.json()
    const data = athleteSchema.parse(body)

    const parent = await prisma.parentProfile.findUnique({ where: { userId } })
    if (!parent) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    const sportRecords = await prisma.sport.findMany({
      where: {
        OR: [
          { id: { in: data.sports } },
          { slug: { in: data.sports } },
        ],
      },
      select: { id: true },
    })

    if (sportRecords.length === 0) {
      return NextResponse.json({ error: 'Select at least one valid sport' }, { status: 400 })
    }

    const athlete = await prisma.athleteProfile.create({
      data: {
        parentProfileId: parent.id,
        firstName: data.firstName,
        lastName: data.lastName,
        dateOfBirth: new Date(data.dateOfBirth),
        gender: data.gender,
        skillLevel: data.skillLevel,
        goals: data.goals || [],
        notes: data.notes,
        sports: {
          create: sportRecords.map((sport: any) => ({ sportId: sport.id })),
        },
      },
      include: { sports: { include: { sport: true } } },
    })

    return NextResponse.json(athlete, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.errors[0].message }, { status: 400 })
    console.error('Create athlete error:', error)
    return NextResponse.json({ error: 'Failed to create athlete' }, { status: 500 })
  }
}
