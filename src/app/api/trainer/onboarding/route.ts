import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { normalizeSpecialtySelections } from '@/lib/trainer'
import { saveTrainerServices, TrainerEditConflict, trainerServiceSchema } from '@/lib/trainer-services'
import { timeToMinutes } from '@/lib/availability'
import { effectiveFeeValues } from '@/lib/fee-config'
import { certificationForEditor, saveTrainerCertifications, trainerCertificationSchema } from '@/lib/trainer-certifications'

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
        availabilitySlots: { where: { isAvailable: true, isRecurring: true, specificDate: null }, orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] },
        user: { select: { email: true } },
      },
    })

    if (!trainer) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    return NextResponse.json({
      minServicePriceInCents: (await effectiveFeeValues(prisma)).minBookingAmountCents,
      revision: trainer.updatedAt.toISOString(),
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
      certifications: trainer.certifications.map(certificationForEditor),
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
  revision: z.string().datetime().optional(),
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
  certifications: z.array(trainerCertificationSchema).max(100).optional(),
  services: z.array(trainerServiceSchema).min(1).max(100),
  availability: z.array(z.object({
    dayOfWeek: z.number().int().min(0).max(6),
    startTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
    endTime: z.string().refine((value) => Number.isFinite(timeToMinutes(value)), 'Invalid end time'),
  }).refine((slot) => timeToMinutes(slot.endTime) > timeToMinutes(slot.startTime), 'Availability must end after it starts')).max(100),
})

export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const userId = session.user.id
    const role = session.user.role
    if (role !== 'TRAINER') return NextResponse.json({ error: 'Only trainers can access this' }, { status: 403 })

    const body = await req.json().catch(() => null)
    const parsed = trainerOnboardingSchema.parse(body)
    const data = {
      ...parsed,
      specialties: normalizeSpecialtySelections(parsed.specialties),
    }

    const trainer = await prisma.trainerProfile.findUnique({ where: { userId } })
    if (!trainer) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    const result = await prisma.$transaction(async (tx) => {
      const fees = await effectiveFeeValues(tx)
      if (data.services.some((service) => service.priceInCents < fees.minBookingAmountCents)) {
        throw new TrainerEditConflict(`Service price must be at least $${(fees.minBookingAmountCents / 100).toFixed(2)}. Reload current pricing requirements.`)
      }
      await tx.$queryRaw`SELECT id FROM trainer_profiles WHERE id = ${trainer.id} FOR UPDATE`
      const current = await tx.trainerProfile.findUnique({ where: { id: trainer.id } })
      if (!current || current.userId !== userId) throw new TrainerEditConflict('Profile changed. Reload before saving.')
      if (data.revision ? current.updatedAt.toISOString() !== data.revision : await tx.serviceOffering.count({ where: { trainerProfileId: trainer.id } }) > 0) {
        throw new TrainerEditConflict('This profile changed or already has saved services. Reload the profile editor before saving.')
      }
      const services = await saveTrainerServices(tx, trainer.id, data.services)
      const certifications = await saveTrainerCertifications(tx, trainer.id, data.certifications)
      const updated = await tx.trainerProfile.update({
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
          updatedAt: new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1)),
        },
      })

      await tx.trainerSport.deleteMany({ where: { trainerProfileId: trainer.id } })
      await tx.trainerSpecialty.deleteMany({ where: { trainerProfileId: trainer.id } })
      await tx.availabilitySlot.deleteMany({ where: { trainerProfileId: trainer.id, isAvailable: true, isRecurring: true, specificDate: null } })

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
      return { services, certifications, revision: updated.updatedAt.toISOString() }
    })

    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.errors[0].message }, { status: 400 })
    if (error instanceof TrainerEditConflict) return NextResponse.json({ error: error.message }, { status: 409 })
    console.error('Trainer profile transaction failed')
    return NextResponse.json({ error: 'Failed to update profile. Reload before retrying.' }, { status: 503 })
  }
}
