import { describe, expect, it } from 'vitest'
import { isStripeAccountReady } from '@/lib/stripe-account'

const flags = { details_submitted: true, charges_enabled: true, payouts_enabled: true }

describe('destination transfer readiness', () => {
  it.each([undefined, null, {}, { transfers: 'inactive' }, { transfers: 'pending' }, { legacy_payments: 'inactive' }])(
    'requires active transfer evidence even when all account flags are true: %j', capabilities => {
      const account = { ...flags, capabilities }
      expect(isStripeAccountReady(account)).toBe(false)
    },
  )
  it.each([{ transfers: 'active' }, { legacy_payments: 'active' }, { transfers: 'inactive', legacy_payments: 'active' }])(
    'accepts current or documented legacy transfer capability: %j', capabilities => {
      const account = { ...flags, capabilities }
      expect(isStripeAccountReady(account)).toBe(true)
    },
  )
  it.each(['details_submitted', 'charges_enabled', 'payouts_enabled'] as const)('still requires %s', key => {
    const account = { ...flags, [key]: false, capabilities: { transfers: 'active' } }
    expect(isStripeAccountReady(account)).toBe(false)
  })
})
