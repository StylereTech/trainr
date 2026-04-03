import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const reviewSchema = z.object({
  rating: z.number().min(1).max(5),
  knowledgeRating: z.number().min(1).max(5),
  communicationRating: z.number().min(1).max(5),
  punctualityRating: z.number().min(1).max(5),
  comment: z.string().max(500).optional(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id
    const { bookingId } = await params
    const body = await req.json()
    const data = reviewSchema.parse(body)

    // Get booking and verify ownership
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { parentProfile: true },
    })

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    if (booking.parentProfile.userId !== userId) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    if (booking.status !== 'COMPLETED') {
      return NextResponse.json({ error: 'Can only review completed sessions' }, { status: 400 })
    }

    // Check for existing review
    const existing = await prisma.review.findUnique({ where: { bookingId } })
    if (existing) {
      return NextResponse.json({ error: 'Review already exists' }, { status: 409 })
    }

    // Create review
    const review = await prisma.review.create({
      data: {
        bookingId,
        trainerProfileId: booking.trainerProfileId,
        parentProfileId: booking.parentProfileId,
        rating: data.rating,
        knowledgeRating: data.knowledgeRating,
        communicationRating: data.communicationRating,
        punctualityRating: data.punctualityRating,
        comment: data.comment,
      },
    })

    // Update trainer aggregate ratings
    const allReviews = await prisma.review.findMany({
      where: { trainerProfileId: booking.trainerProfileId, isPublished: true },
      select: { rating: true },
    })
    const avgRating = allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length

    await prisma.trainerProfile.update({
      where: { id: booking.trainerProfileId },
      data: {
        avgRating: Math.round(avgRating * 10) / 10,
        totalReviews: allReviews.length,
      },
    })

    // Notify trainer
    const trainer = await prisma.trainerProfile.findUnique({ where: { id: booking.trainerProfileId } })
    if (trainer) {
      await prisma.notification.create({
        data: {
          userId: trainer.userId,
          type: 'NEW_REVIEW',
          title: 'New Review!',
          message: `You received a ${data.rating}-star review.`,
          data: { reviewId: review.id },
        },
      })
    }

    return NextResponse.json(review, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 })
    }
    console.error('Review error:', error)
    return NextResponse.json({ error: 'Failed to create review' }, { status: 500 })
  }
}
