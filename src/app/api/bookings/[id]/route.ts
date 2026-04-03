import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const body = await req.json()
    const { action } = body
    const userId = session.user.id
    const role = session.user.role

    const booking = await prisma.booking.findUnique({
      where: { id },
      include: { trainerProfile: true, parentProfile: true },
    })

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    // Verify authorization
    const isTrainer = role === 'TRAINER' && booking.trainerProfile.userId === userId
    const isParent = role === 'PARENT' && booking.parentProfile.userId === userId
    const isAdmin = role === 'ADMIN'

    if (!isTrainer && !isParent && !isAdmin) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    let updateData: any = {}
    let notificationUserId: string | null = null
    let notificationType = ''
    let notificationTitle = ''
    let notificationMessage = ''

    switch (action) {
      case 'confirm':
        if (!isTrainer && !isAdmin) return NextResponse.json({ error: 'Only trainers can confirm' }, { status: 403 })
        if (booking.status !== 'PENDING') return NextResponse.json({ error: 'Can only confirm pending bookings' }, { status: 400 })
        updateData.status = 'CONFIRMED'
        notificationUserId = booking.parentProfile.userId
        notificationType = 'BOOKING_CONFIRMED'
        notificationTitle = 'Booking Confirmed!'
        notificationMessage = `Your session on ${booking.date.toLocaleDateString()} has been confirmed.`
        break

      case 'cancel':
        if (booking.status !== 'PENDING' && booking.status !== 'CONFIRMED') {
          return NextResponse.json({ error: 'Cannot cancel this booking' }, { status: 400 })
        }
        updateData.status = 'CANCELLED'
        updateData.cancellationReason = body.reason || 'Cancelled by user'
        if (isParent) {
          notificationUserId = booking.trainerProfile.userId
          notificationType = 'BOOKING_CANCELLED'
          notificationTitle = 'Booking Cancelled'
          notificationMessage = `The parent has cancelled the session on ${booking.date.toLocaleDateString()}.`
        } else {
          notificationUserId = booking.parentProfile.userId
          notificationType = 'BOOKING_CANCELLED'
          notificationTitle = 'Booking Cancelled'
          notificationMessage = `The trainer has cancelled your session on ${booking.date.toLocaleDateString()}. You will receive a full refund.`
        }
        break

      case 'complete':
        if (!isTrainer && !isAdmin) return NextResponse.json({ error: 'Only trainers can mark complete' }, { status: 403 })
        if (booking.status !== 'CONFIRMED') return NextResponse.json({ error: 'Can only complete confirmed bookings' }, { status: 400 })
        updateData.status = 'COMPLETED'
        // Update trainer stats
        await prisma.trainerProfile.update({
          where: { id: booking.trainerProfileId },
          data: { totalSessions: { increment: 1 }, totalBookings: { increment: 1 } },
        })
        notificationUserId = booking.parentProfile.userId
        notificationType = 'SESSION_COMPLETED'
        notificationTitle = 'Session Completed!'
        notificationMessage = 'Your training session has been marked complete. Please leave a review!'
        break

      case 'no_show':
        if (!isTrainer && !isAdmin) return NextResponse.json({ error: 'Only trainers can mark no-show' }, { status: 403 })
        if (booking.status !== 'CONFIRMED') return NextResponse.json({ error: 'Invalid booking status' }, { status: 400 })
        updateData.status = 'NO_SHOW'
        notificationUserId = booking.parentProfile.userId
        notificationType = 'NO_SHOW'
        notificationTitle = 'No-Show Recorded'
        notificationMessage = 'A no-show has been recorded for your session. No refund will be issued.'
        break

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    const updated = await prisma.booking.update({ where: { id }, data: updateData })

    // Send notification
    if (notificationUserId) {
      await prisma.notification.create({
        data: {
          userId: notificationUserId,
          type: notificationType,
          title: notificationTitle,
          message: notificationMessage,
          data: { bookingId: id },
        },
      })
    }

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Booking action error:', error)
    return NextResponse.json({ error: 'Failed to update booking' }, { status: 500 })
  }
}
