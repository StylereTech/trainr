import type { Booking, CheckoutAttempt, Payment } from '@prisma/client'
import { z } from 'zod'
import { stripe } from '@/lib/stripe'

export class SettlementConflict extends Error {}

const requestOptions = { timeout: 4000, maxNetworkRetries: 0 }
const metadataSchema = z.object({ bookingId: z.string(), paymentId: z.string(), checkoutAttemptId: z.string() })
const savedParametersSchema = z.object({
  mode: z.literal('payment'),
  metadata: metadataSchema,
  line_items: z.array(z.object({ quantity: z.literal(1), price_data: z.object({ currency: z.literal('usd'), unit_amount: z.number().int().positive() }) })).length(1),
  payment_intent_data: z.object({
    application_fee_amount: z.number().int().nonnegative(),
    transfer_data: z.object({ destination: z.string().startsWith('acct_'), amount: z.undefined() }),
    metadata: metadataSchema,
  }),
})
type SettlementBooking = Pick<Booking, 'id' | 'totalAmountInCents' | 'platformFeeInCents' | 'trainerPayoutInCents'> & { payment: Payment }
function objectId(value: string | { id: string } | null | undefined) { return typeof value === 'string' ? value : value?.id || null }
function cents(value: number, maximum: number) { return Number.isSafeInteger(value) && value >= 0 && value <= maximum }

// Called while booking/payment rows are locked; bounded provider reads prevent stale observations racing settlement.
export async function verifyDestinationSettlement(booking: SettlementBooking, attempt: CheckoutAttempt | null, intentId: string, eventChargeId?: string | null) {
  const payment = booking.payment
  const parsed = savedParametersSchema.safeParse(attempt?.parameters)
  if (!attempt || attempt.retiredAt || !parsed.success) throw new SettlementConflict('Immutable checkout destination is missing; payment requires reconciliation')
  const saved = parsed.data
  const metadata = { bookingId: booking.id, paymentId: payment.id, checkoutAttemptId: attempt.id }
  const matchesMetadata = (value: Record<string, string> | null | undefined) =>
    !!value && Object.entries(metadata).every(([key, expected]) => value[key] === expected)
  const amount = payment.amountInCents
  const feeAmount = payment.platformFeeInCents
  const destination = saved.payment_intent_data.transfer_data.destination
  if (attempt.paymentId !== payment.id || !Number.isSafeInteger(amount) || amount <= 0 ||
      !cents(feeAmount, amount) || !cents(payment.trainerPayoutInCents, amount) ||
      feeAmount + payment.trainerPayoutInCents !== amount || booking.totalAmountInCents !== amount ||
      booking.platformFeeInCents !== feeAmount || booking.trainerPayoutInCents !== payment.trainerPayoutInCents ||
      saved.line_items[0].price_data.unit_amount !== amount || saved.payment_intent_data.application_fee_amount !== feeAmount ||
      !matchesMetadata(saved.metadata) || !matchesMetadata(saved.payment_intent_data.metadata)) {
    throw new SettlementConflict('Saved checkout financial identity requires reconciliation')
  }

  const intent = await stripe.paymentIntents.retrieve(intentId, {}, requestOptions)
  if (intent.id !== intentId || intent.status !== 'succeeded' || intent.amount !== amount || intent.amount_received !== amount ||
      intent.currency !== 'usd' || typeof intent.livemode !== 'boolean' || !matchesMetadata(intent.metadata) ||
      (intent.application_fee_amount ?? 0) !== feeAmount || objectId(intent.transfer_data?.destination) !== destination ||
      (intent.transfer_data?.amount != null && intent.transfer_data.amount !== amount)) {
    throw new SettlementConflict('Stripe payment destination or financial identity does not match checkout')
  }
  const chargeId = objectId(intent.latest_charge)
  if (!chargeId || (eventChargeId && eventChargeId !== chargeId) || (payment.stripeChargeId && payment.stripeChargeId !== chargeId)) {
    throw new SettlementConflict('Stripe captured charge identity requires reconciliation')
  }
  const charge = await stripe.charges.retrieve(chargeId, {}, requestOptions)
  if (charge.id !== chargeId || objectId(charge.payment_intent) !== intentId || charge.status !== 'succeeded' ||
      !charge.paid || !charge.captured || charge.amount !== amount || charge.amount_captured !== amount || charge.currency !== 'usd' ||
      charge.livemode !== intent.livemode || !matchesMetadata(charge.metadata) ||
      (charge.application_fee_amount ?? 0) !== feeAmount || objectId(charge.transfer_data?.destination) !== destination ||
      (charge.transfer_data?.amount != null && charge.transfer_data.amount !== amount) || !cents(charge.amount_refunded, amount)) {
    throw new SettlementConflict('Stripe captured charge does not match checkout')
  }
  const transferId = objectId(charge.transfer)
  if (!transferId) throw new Error('Stripe destination transfer is not available; retry required')
  if (payment.stripeTransferId && payment.stripeTransferId !== transferId) throw new SettlementConflict('Stripe transfer identity changed')
  const transfer = await stripe.transfers.retrieve(transferId, {}, requestOptions)
  // With application_fee_amount Stripe transfers gross, then returns the fee to the platform.
  if (transfer.id !== transferId || objectId(transfer.source_transaction) !== chargeId || objectId(transfer.destination) !== destination ||
      !objectId(transfer.destination_payment) || transfer.amount !== amount || transfer.currency !== 'usd' ||
      transfer.livemode !== intent.livemode || !cents(transfer.amount_reversed, amount)) {
    throw new SettlementConflict('Stripe transfer does not match the captured destination charge')
  }
  const feeId = objectId(charge.application_fee)
  let feeRefunded = false
  if (feeAmount > 0) {
    if (!feeId) throw new Error('Stripe application fee receipt is not available; retry required')
    const fee = await stripe.applicationFees.retrieve(feeId, {}, requestOptions)
    if (fee.id !== feeId || objectId(fee.account) !== destination || objectId(fee.originating_transaction) !== chargeId ||
        objectId(fee.charge) !== objectId(transfer.destination_payment) || fee.amount !== feeAmount || fee.currency !== 'usd' ||
        fee.livemode !== intent.livemode || !cents(fee.amount_refunded, feeAmount)) {
      throw new SettlementConflict('Stripe application fee does not match the agreed split')
    }
    feeRefunded = fee.refunded || fee.amount_refunded > 0
  } else if (feeId) {
    throw new SettlementConflict('Unexpected Stripe application fee on a zero-fee checkout')
  }
  const hasRefunds = charge.refunded || charge.amount_refunded > 0
  return { chargeId, transferId, hasRefunds, requiresReview: hasRefunds || charge.disputed || transfer.reversed || transfer.amount_reversed > 0 || feeRefunded }
}
