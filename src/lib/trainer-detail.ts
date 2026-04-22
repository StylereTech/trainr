import { prisma } from '@/lib/prisma'

export async function getPublicTrainerBySlug(slug: string) {
  return prisma.trainerProfile.findFirst({
    where: {
      slug,
      approvalStatus: 'APPROVED',
      isActive: true,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      slug: true,
      headline: true,
      bio: true,
      city: true,
      state: true,
      locationType: true,
      travelRadius: true,
      yearsExperience: true,
      avgRating: true,
      totalReviews: true,
      totalSessions: true,
      sports: {
        select: {
          sport: {
            select: {
              name: true,
              icon: true,
            },
          },
        },
      },
      specialties: {
        select: {
          specialty: {
            select: {
              name: true,
              slug: true,
            },
          },
        },
      },
      certifications: {
        select: {
          name: true,
          issuingOrg: true,
          isVerified: true,
        },
      },
      serviceOfferings: {
        where: { isActive: true },
        orderBy: { priceInCents: 'asc' },
        select: {
          id: true,
          title: true,
          description: true,
          durationMinutes: true,
          priceInCents: true,
          type: true,
          maxParticipants: true,
        },
      },
      packages: {
        where: { isActive: true },
        select: {
          id: true,
          title: true,
          description: true,
          totalSessions: true,
          priceInCents: true,
          validForDays: true,
          items: {
            select: {
              sessionsCount: true,
              serviceOffering: {
                select: {
                  title: true,
                },
              },
            },
          },
        },
      },
      availabilitySlots: {
        where: { isAvailable: true },
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
        select: {
          dayOfWeek: true,
          startTime: true,
          endTime: true,
          isRecurring: true,
        },
      },
      assets: {
        where: { type: { in: ['PHOTO', 'GALLERY'] } },
        orderBy: { order: 'asc' },
        select: {
          url: true,
          type: true,
          order: true,
        },
      },
      reviews: {
        where: { isPublished: true },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          rating: true,
          knowledgeRating: true,
          communicationRating: true,
          punctualityRating: true,
          comment: true,
          createdAt: true,
          parentProfile: {
            select: {
              user: {
                select: {
                  email: true,
                },
              },
            },
          },
        },
      },
      _count: {
        select: {
          reviews: { where: { isPublished: true } },
        },
      },
    },
  })
}
