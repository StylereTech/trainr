import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { createConnectedAccount, stripe } from '@/lib/stripe'
import { isStripeAccountReady } from '@/lib/stripe-account'

export class ConnectAccountError extends Error {
  constructor(message: string, public status = 409) { super(message) }
}

export async function currentConnectTrainer(userId: string, db: Prisma.TransactionClient = prisma) {
  const trainer = await db.trainerProfile.findUnique({ where: { userId }, include: { user: { select: { role: true, deletedAt: true, email: true, sessionVersion: true } } } })
  if (!trainer) throw new ConnectAccountError('Trainer profile not found', 404)
  if (trainer.user.role !== 'TRAINER' || trainer.user.deletedAt) throw new ConnectAccountError('Active trainer account required', 403)
  return trainer
}

// Reserve before contacting Stripe. Ambiguous attempts never rotate their key or account identity.
export async function ensureConnectAccount(userId: string) {
  const reservation = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`
    const trainer = await currentConnectTrainer(userId, tx)
    await tx.$queryRaw`SELECT id FROM trainer_profiles WHERE id = ${trainer.id} FOR UPDATE`
    const current = await currentConnectTrainer(userId, tx)
    if (current.stripeAccountId) return { trainer: current, attempt: null }
    const history = await tx.payment.findFirst({ where: { booking: { trainerProfileId: current.id }, OR: [
      { stripeCheckoutSessionId: { not: null } }, { stripePaymentIntentId: { not: null } }, { stripeChargeId: { not: null } },
      { stripeTransferId: { not: null } }, { checkoutAttempts: { some: {} } },
      { amountInCents: { gt: 0 }, status: { in: ['SUCCEEDED', 'REFUNDED', 'PARTIALLY_REFUNDED'] } },
    ] }, select: { id: true } })
    if (history) throw new ConnectAccountError('Existing payment history has no connected account. Contact support for reconciliation before setup.')
    const attempt = await tx.connectAccountAttempt.upsert({ where: { trainerProfileId: current.id }, update: {},
      create: { trainerProfileId: current.id, email: current.user.email } })
    if (!attempt.email || attempt.stripeAccountId || Date.now() - attempt.createdAt.getTime() >= 23 * 60 * 60 * 1000) {
      throw new ConnectAccountError('Stripe setup requires account reconciliation. Contact support; do not create another account.')
    }
    return { trainer: current, attempt }
  })
  if (!reservation.attempt) return reservation.trainer.stripeAccountId!
  const { trainer, attempt } = reservation
  const account = await createConnectedAccount(trainer.id, attempt.email!, `trainr-connect-${attempt.id}`)
  if (!account.id || account.deleted || account.type !== 'express') throw new ConnectAccountError('Stripe returned an unexpected account. Contact support.')
  const result = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`
    await tx.$queryRaw`SELECT id FROM trainer_profiles WHERE id = ${trainer.id} FOR UPDATE`
    const current = await tx.trainerProfile.findUnique({ where: { id: trainer.id }, include: { user: true } })
    const saved = await tx.connectAccountAttempt.findUniqueOrThrow({ where: { id: attempt.id } })
    if (saved.stripeAccountId && saved.stripeAccountId !== account.id) return false
    await tx.connectAccountAttempt.update({ where: { id: attempt.id }, data: { stripeAccountId: account.id, email: null } })
    // Keep the provider identity for reconciliation even when access changed during the request.
    if (!current || current.user.deletedAt || current.user.role !== 'TRAINER' || current.user.sessionVersion !== trainer.user.sessionVersion) return false
    if (current.stripeAccountId && current.stripeAccountId !== account.id) return false
    if (!current.stripeAccountId) await tx.trainerProfile.update({ where: { id: trainer.id }, data: { stripeAccountId: account.id, stripeOnboardingComplete: false } })
    return true
  })
  if (!result) throw new ConnectAccountError('Account access changed during Stripe setup. Contact support for reconciliation.')
  return account.id
}

export async function verifiedConnectAccount(userId: string, accountId: string) {
  const before = await currentConnectTrainer(userId)
  if (before.stripeAccountId !== accountId) throw new ConnectAccountError('Stripe account changed. Reload before continuing.')
  const account = await stripe.accounts.retrieve(accountId)
  if (account.deleted || account.id !== accountId) throw new ConnectAccountError('Existing Stripe account could not be verified. Contact support; its identity has been preserved.')
  const current = await currentConnectTrainer(userId)
  if (current.stripeAccountId !== accountId || current.user.sessionVersion !== before.user.sessionVersion) throw new ConnectAccountError('Account access changed. Reload before continuing.')
  await prisma.trainerProfile.updateMany({ where: { id: current.id, stripeAccountId: accountId }, data: { stripeOnboardingComplete: isStripeAccountReady(account) } })
  return account
}
