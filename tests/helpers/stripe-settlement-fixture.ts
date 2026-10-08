// Synthetic provider objects, never receipts from a Stripe account.
export function settlementFixture(input: { bookingId?: string; paymentId?: string; attemptId?: string; intentId?: string; chargeId?: string } = {}) {
  const bookingId = input.bookingId || 'booking'
  const paymentId = input.paymentId || 'payment'
  const attemptId = input.attemptId || 'attempt'
  const intentId = input.intentId || 'pi_settlement'
  const chargeId = input.chargeId || 'ch_settlement'
  const metadata = { bookingId, paymentId, checkoutAttemptId: attemptId }
  const split = { platformFeeInCents: 900, trainerPayoutInCents: 5100 }
  const parameters = {
    mode: 'payment', metadata: { ...metadata },
    line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: 6000 } }],
    payment_intent_data: { application_fee_amount: 900, transfer_data: { destination: 'acct_settlement' }, metadata: { ...metadata } },
  }
  return {
    booking: { id: bookingId, totalAmountInCents: 6000, ...split,
      payment: { id: paymentId, amountInCents: 6000, ...split, stripeChargeId: null, stripeTransferId: null } },
    attempt: { id: attemptId, paymentId, parameters, retiredAt: null },
    intent: { id: intentId, status: 'succeeded', amount: 6000, amount_received: 6000, currency: 'usd', livemode: false,
      metadata: { ...metadata }, latest_charge: chargeId, application_fee_amount: 900, transfer_data: { destination: 'acct_settlement' } },
    charge: { id: chargeId, status: 'succeeded', payment_intent: intentId, paid: true, captured: true, amount: 6000, amount_captured: 6000,
      amount_refunded: 0, refunded: false, disputed: false, currency: 'usd', livemode: false, metadata: { ...metadata },
      transfer: 'tr_settlement', transfer_data: { destination: 'acct_settlement' }, application_fee_amount: 900, application_fee: 'fee_settlement' },
    transfer: { id: 'tr_settlement', source_transaction: chargeId, destination: 'acct_settlement', destination_payment: 'py_settlement',
      amount: 6000, amount_reversed: 0, reversed: false, currency: 'usd', livemode: false },
    fee: { id: 'fee_settlement', account: 'acct_settlement', originating_transaction: chargeId, charge: 'py_settlement',
      amount: 900, amount_refunded: 0, refunded: false, currency: 'usd', livemode: false },
  }
}
