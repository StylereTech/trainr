import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { hash } from 'bcryptjs'
import crypto from 'crypto'

function deletedEmail(userId: string) {
  return `deleted-${userId}-${Date.now()}@deleted.trainr.local`
}

export async function DELETE(req: NextRequest) {
  try {
    const requestUser = await getRequestUser(req)
    if (!requestUser?.id) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: requestUser.id },
      include: {
        parentProfile: { include: { athletes: true } },
        trainerProfile: true,
      },
    })

    if (!user) {
      return NextResponse.json({ success: true, deleted: true })
    }

    if (user.role === 'ADMIN') {
      return NextResponse.json({ error: 'Admin accounts must be transferred before deletion.' }, { status: 403 })
    }

    const randomPasswordHash = await hash(crypto.randomBytes(32).toString('hex'), 12)
    const anonymizedEmail = deletedEmail(user.id)
    const now = new Date()

    await prisma.$transaction(async (tx) => {
      await tx.notification.deleteMany({ where: { userId: user.id } })
      await tx.favorite.deleteMany({
        where: {
          OR: [
            user.parentProfile ? { parentProfileId: user.parentProfile.id } : undefined,
            user.trainerProfile ? { trainerProfileId: user.trainerProfile.id } : undefined,
          ].filter(Boolean) as any,
        },
      })
      await tx.uploadedAsset.deleteMany({ where: { userId: user.id } })
      await tx.message.updateMany({ where: { senderId: user.id }, data: { content: 'Message removed because this account was deleted.', isFlagged: false } })
      await tx.messageThread.updateMany({
        where: { OR: [{ participantAId: user.id }, { participantBId: user.id }] },
        data: { isActive: false, lastMessageAt: now },
      })

      if (user.parentProfile) {
        await tx.athleteProfile.updateMany({
          where: { parentProfileId: user.parentProfile.id },
          data: {
            firstName: 'Deleted',
            lastName: 'Athlete',
            goals: [],
            notes: null,
          },
        })
        await tx.parentProfile.update({
          where: { id: user.parentProfile.id },
          data: {
            phone: null,
            address: null,
            city: null,
            state: null,
            zipCode: null,
            latitude: null,
            longitude: null,
          },
        })
      }

      if (user.trainerProfile) {
        await tx.trainerProfile.update({
          where: { id: user.trainerProfile.id },
          data: {
            firstName: 'Deleted',
            lastName: 'Trainer',
            slug: `deleted-trainer-${user.trainerProfile.id}`,
            headline: null,
            bio: null,
            phone: null,
            address: null,
            city: null,
            state: null,
            zipCode: null,
            latitude: null,
            longitude: null,
            isActive: false,
            featured: false,
          },
        })
        await tx.serviceOffering.updateMany({ where: { trainerProfileId: user.trainerProfile.id }, data: { isActive: false } })
        await tx.package.updateMany({ where: { trainerProfileId: user.trainerProfile.id }, data: { isActive: false } })
        await tx.availabilitySlot.updateMany({ where: { trainerProfileId: user.trainerProfile.id }, data: { isAvailable: false } })
      }

      await tx.user.update({
        where: { id: user.id },
        data: {
          email: anonymizedEmail,
          emailVerified: null,
          passwordHash: randomPasswordHash,
          image: null,
          verificationToken: null,
          verificationExpiry: null,
          resetPasswordToken: null,
          resetPasswordExpiry: null,
          updatedAt: now,
        },
      })
    })

    return NextResponse.json({ success: true, deleted: true })
  } catch (error) {
    console.error('Account deletion error:', error)
    return NextResponse.json({ error: 'Unable to delete account. Please try again.' }, { status: 500 })
  }
}
