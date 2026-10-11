type AccountReadiness = {
  // Stripe's active Account uses void; DeletedAccount uses true.
  deleted?: boolean | void
  details_submitted?: boolean
  charges_enabled?: boolean
  payouts_enabled?: boolean
  capabilities?: { transfers?: string; legacy_payments?: string } | null
}

export function hasStripeTransferCapability(account: AccountReadiness): boolean {
  // Stripe retains transfer support on legacy accounts during capability migration.
  return !account.deleted && (account.capabilities?.transfers === 'active' || account.capabilities?.legacy_payments === 'active')
}

// Destination charges require transfers as well as TRAINR's collection/payout gates.
export function isStripeAccountReady(account: AccountReadiness): boolean {
  return !account.deleted && account.details_submitted === true &&
    account.charges_enabled === true && account.payouts_enabled === true && hasStripeTransferCapability(account)
}
