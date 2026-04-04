import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { normalizeSpecialtySelections } from '@/lib/trainer'

// GET /api/trainer/onboarding — Fetch existing trainer profile data for editing
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const userId = (session.user as any).id
    const role = (session.user as any).role
    if (role !== 'TRAINER') return NextResponse.json({ error: 'Only trainers' }, { status: 403 })

    const trainer = await prisma.trainerProfile.findUnique({
      where: { userId },
      include: {
        sports: { include: { sport: true } },
        specialties: { include: { specialty: true } },
        certifications: true,
        serviceOfferings: { where: { isActive: true }, orderBy: { createdAt: 'asc' } },
        availabilitySlots: { where: { isAvailable: true }, orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] },
        user: { select: { email: true } },
      },
    })

    if (!trainer) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    return NextResponse.json({
      profile: {
        firstName: trainer.firstName,
        lastName: trainer.lastName,
        headline: trainer.headline || '',
        bio: trainer.bio || '',
        phone: trainer.phone || '',
        yearsExperience: trainer.yearsExperience,
        locationType: trainer.locationType,
        address: trainer.address || '',
        city: trainer.city || '',
        state: trainer.state || '',
        zipCode: trainer.zipCode || '',
        travelRadius: trainer.travelRadius,
        slug: trainer.slug,
        email: trainer.user.email,
        approvalStatus: trainer.approvalStatus,
        stripeOnboardingComplete: trainer.stripeOnboardingComplete,
      },
      sports: trainer.sports.map((s: any) => s.sport.slug),
      specialties: trainer.specialties.map((s: any) => s.specialty.slug),
      certifications: trainer.certifications.map((c: any) => ({
        name: c.name,
        issuingOrg: c.issuingOrg || '',
      })),
      services: trainer.serviceOfferings.map((s: any) => ({
        id: s.id,
        title: s.title,
        description: s.description || '',
        durationMinutes: s.durationMinutes,
        priceInCents: s.priceInCents,
        type: s.type,
        maxParticipants: s.maxParticipants,
      })),
      availability: trainer.availabilitySlots.map((a: any) => ({
        dayOfWeek: a.dayOfWeek,
        startTime: a.startTime,
        endTime: a.endTime,
      })),
    })
  } catch (error) {
    console.error('Get trainer profile error:', error)
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 })
  }
}

const trainerOnboardingSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  headline: z.string().max(100).optional(),
  bio: z.string().max(2000).optional(),
  phone: z.string().optional(),
  yearsExperience: z.number().min(0).max(50),
  locationType: z.enum(['IN_PERSON', 'VIRTUAL', 'BOTH']),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  travelRadius: z.number().min(5).max(100).default(25),
  sports: z.array(z.string()).min(1),
  specialties: z.array(z.string()).min(1),
  certifications: z.array(z.object({
    name: z.string(),
    issuingOrg: z.string().optional(),
    credentialId: z.string().optional(),
  })).optional(),
  services: z.array(z.object({
    title: z.string(),
    description: z.string().optional(),
    durationMinutes: z.number().default(60),
    priceInCents: z.number().min(1500),
    type: z.enum(['INDIVIDUAL', 'GROUP', 'VIRTUAL']).default('INDIVIDUAL'),
    maxParticipants: z.number().default(1),
  })).min(1),
  availability: z.array(z.object({
    dayOfWeek: z.number().min(0).max(6),
    startTime: z.string(),
    endTime: z.string(),
  })).min(1),
})

export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const userId = session.user.id
    const role = session.user.role
    if (role !== 'TRAINER') return NextResponse.json({ error: 'Only trainers can access this' }, { status: 403 })

    const body = await req.json()
    const parsed = trainerOnboardingSchema.parse(body)
    const data = {
      ...parsed,
      specialties: normalizeSpecialtySelections(parsed.specialties),
    }

    const trainer = await prisma.trainerProfile.findUnique({ where: { userId } })
    if (!trainer) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    await prisma.$transaction(async (tx: any) => {
      await tx.trainerProfile.update({
        where: { id: trainer.id },
        data: {
          firstName: data.firstName,
          lastName: data.lastName,
          headline: data.headline,
          bio: data.bio,
          phone: data.phone,
          yearsExperience: data.yearsExperience,
          locationType: data.locationType,
          address: data.address,
          city: data.city,
          state: data.state,
          zipCode: data.zipCode,
          travelRadius: data.travelRadius,
          completionPercentage: 100,
        },
      })

      await tx.trainerSport.deleteMany({ where: { trainerProfileId: trainer.id } })
      await tx.trainerSpecialty.deleteMany({ where: { trainerProfileId: trainer.id } })
      await tx.availabilitySlot.deleteMany({ where: { trainerProfileId: trainer.id } })

      for (const sportSlug of data.sports) {
        const sport = await tx.sport.findUnique({ where: { slug: sportSlug } })
        if (sport) {
          await tx.trainerSport.create({
            data: { trainerProfileId: trainer.id, sportId: sport.id },
          })
        }
      }

      for (const specSlug of data.specialties) {
        const spec = await tx.specialty.findFirst({ where: { slug: specSlug } })
        if (spec) {
          await tx.trainerSpecialty.create({
            data: { trainerProfileId: trainer.id, specialtyId: spec.id },
          })
        }
      }

      await tx.certification.deleteMany({ where: { trainerProfileId: trainer.id } })
      if (data.certifications) {
        for (const cert of data.certifications) {
          await tx.certification.create({
            data: {
              trainerProfileId: trainer.id,
              name: cert.name,
              issuingOrg: cert.issuingOrg,
              credentialId: cert.credentialId,
            },
          })
        }
      }

      const existingServices = await tx.serviceOffering.findMany({
        where: { trainerProfileId: trainer.id },
        include: { _count: { select: { bookings: true } } },
        orderBy: { createdAt: 'asc' },
      })

      for (const [index, svc] of data.services.entries()) {
        const existing = existingServices[index]
        if (existing) {
          await tx.serviceOffering.update({
            where: { id: existing.id },
            data: {
              title: svc.title,
              description: svc.description,
              durationMinutes: svc.durationMinutes,
              priceInCents: svc.priceInCents,
              type: svc.type,
              maxParticipants: svc.maxParticipants,
              isActive: true,
            },
          })
        } else {
          await tx.serviceOffering.create({
            data: {
              trainerProfileId: trainer.id,
              title: svc.title,
              description: svc.description,
              durationMinutes: svc.durationMinutes,
              priceInCents: svc.priceInCents,
              type: svc.type,
              maxParticipants: svc.maxParticipants,
              isActive: true,
            },
          })
        }
      }

      for (const leftover of existingServices.slice(data.services.length)) {
        if (leftover._count.bookings > 0) {
          await tx.serviceOffering.update({ where: { id: leftover.id }, data: { isActive: false } })
        } else {
          await tx.serviceOffering.delete({ where: { id: leftover.id } })
        }
      }

      for (const slot of data.availability) {
        await tx.availabilitySlot.create({
          data: {
            trainerProfileId: trainer.id,
            dayOfWeek: slot.dayOfWeek,
            startTime: slot.startTime,
            endTime: slot.endTime,
            isRecurring: true,
          },
        })
      }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.errors[0].message }, { status: 400 })
    console.error('Trainer onboarding error:', error)
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 })
  }
}
