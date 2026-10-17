import { describe, expect, it, vi } from 'vitest'
import { connectStatusSchema, stripeRedirect } from '@/lib/connect-contract'
const create = vi.hoisted(() => vi.fn())
const updateCapability = vi.hoisted(() => vi.fn())
vi.mock('stripe', () => ({ default: class { accounts = { create, updateCapability } } }))

describe('Connect contracts', () => {
  it('requires a complete provider status instead of accepting a successful malformed response', () => {
    expect(connectStatusSchema.safeParse({ stripeOnboardingComplete: true }).success).toBe(false)
  })
  it('requires explicit transfer status, including null while unverified', () => {
    const status = { providerConfigured: true, publishableKeyConfigured: true, stripeAccountId: 'acct_test', stripeOnboardingComplete: true,
      chargesEnabled: true, payoutsEnabled: true, providerError: '', dashboardSupported: true, onboardingSupported: false }
    expect(connectStatusSchema.safeParse(status).success).toBe(false)
    expect(connectStatusSchema.safeParse({ ...status, transfersEnabled: null }).success).toBe(true)
    expect(connectStatusSchema.safeParse({ ...status, transfersEnabled: true }).success).toBe(true)
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
    expect(create).toHaveBeenCalledWith({ type: 'express', country: 'US', email: 'synthetic@example.test',
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } }, metadata: { trainerId: 'profile' } },
      { idempotencyKey: 'durable-key', timeout: 15000, maxNetworkRetries: 0 })
  })
  it('requests only missing capabilities on an existing connected account', async () => {
    const { requestMissingConnectCapabilities } = await import('@/lib/stripe')
    updateCapability.mockResolvedValue({ requested: true })
    await requestMissingConnectCapabilities({ id: 'acct_existing', capabilities: {} })
    expect(updateCapability.mock.calls.map(call => call[1])).toEqual(['transfers', 'card_payments'])
    expect(updateCapability).toHaveBeenCalledWith('acct_existing', 'card_payments', { requested: true },
      { idempotencyKey: 'trainr-connect-v2-acct_existing-card_payments', timeout: 15000, maxNetworkRetries: 0 })
    expect(updateCapability).toHaveBeenCalledWith('acct_existing', 'transfers', { requested: true },
      { idempotencyKey: 'trainr-connect-v2-acct_existing-transfers', timeout: 15000, maxNetworkRetries: 0 })
    updateCapability.mockClear()
    await requestMissingConnectCapabilities({ id: 'acct_existing', capabilities: { card_payments: 'inactive', transfers: 'pending' } })
    expect(updateCapability).not.toHaveBeenCalled()
  })
})
