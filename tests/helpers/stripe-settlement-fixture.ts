// Synthetic provider objects, never receipts from a Stripe account.
export function settlementFixture(input: { bookingId?: string; paymentId?: string; attemptId?: string; intentId?: string; chargeId?: string } = {}) {
  const bookingId = input.bookingId || 'booking'
  const paymentId = input.paymentId || 'payment'
  const attemptId = input.attemptId || 'attempt'
  const intentId = input.intentId || 'pi_settlement'
  const chargeId = input.chargeId || 'ch_settlement'
  const suffix = input.bookingId ? `_${input.bookingId}` : ''
  const transferId = `tr_settlement${suffix}`, feeId = `fee_settlement${suffix}`, destinationPaymentId = `py_settlement${suffix}`
  const metadata = { bookingId, paymentId, checkoutAttemptId: attemptId }
  const split = { platformFeeInCents: 900, trainerPayoutInCents: 5100 }
  const parameters = {
    mode: 'payment', metadata: { ...metadata },
    line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: 6000 } }],
    payment_intent_data: { application_fee_amount: 900, transfer_data: { destination: 'acct_settlement' }, metadata: { ...metadata } },
  }
  return {
    disputes: [] as Array<Record<string, unknown>>,
    booking: { id: bookingId, totalAmountInCents: 6000, ...split,
      payment: { id: paymentId, amountInCents: 6000, ...split, stripeChargeId: null, stripeTransferId: null } },
    attempt: { id: attemptId, paymentId, parameters, retiredAt: null },
    intent: { id: intentId, status: 'succeeded', amount: 6000, amount_received: 6000, currency: 'usd', livemode: false,
      metadata: { ...metadata }, latest_charge: chargeId, application_fee_amount: 900, transfer_data: { destination: 'acct_settlement' } },
    charge: { id: chargeId, status: 'succeeded', payment_intent: intentId, paid: true, captured: true, amount: 6000, amount_captured: 6000,
      amount_refunded: 0, refunded: false, disputed: false, currency: 'usd', livemode: false, metadata: { ...metadata },
      transfer: transferId, transfer_data: { destination: 'acct_settlement' }, application_fee_amount: 900, application_fee: feeId },
    transfer: { id: transferId, source_transaction: chargeId, destination: 'acct_settlement', destination_payment: destinationPaymentId,
      amount: 6000, amount_reversed: 0, reversed: false, currency: 'usd', livemode: false },
    fee: { id: feeId, account: 'acct_settlement', originating_transaction: chargeId, charge: destinationPaymentId,
      amount: 900, amount_refunded: 0, refunded: false, currency: 'usd', livemode: false },
  }
}

export function settlementDispute(f: ReturnType<typeof settlementFixture>, changes: Record<string, unknown> = {}) {
  return { id: 'du_synthetic', charge: f.charge.id, payment_intent: f.intent.id, amount: 6000, currency: 'usd', livemode: false,
    status: 'needs_response', evidence_details: { due_by: 1792000000 }, balance_transactions: [], ...changes }
}
