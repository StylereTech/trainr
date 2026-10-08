import { describe, expect, it, vi } from 'vitest'
import { connectStatusSchema, stripeRedirect } from '@/lib/connect-contract'
const create = vi.hoisted(() => vi.fn())
vi.mock('stripe', () => ({ default: class { accounts = { create } } }))

describe('Connect contracts', () => {
  it('requires a complete provider status instead of accepting a successful malformed response', () => {
    expect(connectStatusSchema.safeParse({ stripeOnboardingComplete: true }).success).toBe(false)
  })
  it.each(['javascript:alert(1)', 'https://stripe.com.attacker.test/login', 'http://connect.stripe.com/x', 'https://user:pass@connect.stripe.com/x', 'https://connect.stripe.com:444/x', null])('rejects untrusted redirect %s', value => {
    expect(stripeRedirect(value)).toBeNull()
  })
  it.each(['https://connect.stripe.com/setup/synthetic', 'https://dashboard.stripe.com/synthetic'])('accepts Stripe HTTPS redirect %s', value => {
    expect(stripeRedirect(value)).toBe(value)
  })
  it('sends the durable attempt key with bounded provider creation and profile metadata', async () => {
    const { createConnectedAccount } = await import('@/lib/stripe')
    await createConnectedAccount('profile', 'synthetic@example.test', 'durable-key')
    expect(create).toHaveBeenCalledWith({ type: 'express', country: 'US', email: 'synthetic@example.test', metadata: { trainerId: 'profile' } },
      { idempotencyKey: 'durable-key', timeout: 15000, maxNetworkRetries: 0 })
  })
})
