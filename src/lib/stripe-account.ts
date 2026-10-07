type AccountReadiness = {
  deleted?: boolean
  details_submitted?: boolean
  charges_enabled?: boolean
  payouts_enabled?: boolean
}

// TRAINR requires both payment collection and bank payouts before paid bookings.
export function isStripeAccountReady(account: AccountReadiness): boolean {
  return !account.deleted && account.details_submitted === true &&
    account.charges_enabled === true && account.payouts_enabled === true
}
