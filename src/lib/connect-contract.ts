import { z } from 'zod'

export const connectStatusSchema = z.object({
  providerConfigured: z.boolean(), publishableKeyConfigured: z.boolean(),
  stripeAccountId: z.string().nullable(), stripeOnboardingComplete: z.boolean(),
  chargesEnabled: z.boolean().nullable(), payoutsEnabled: z.boolean().nullable(),
  providerError: z.string(), dashboardSupported: z.boolean(), onboardingSupported: z.boolean(),
})

export function stripeRedirect(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      ['connect.stripe.com', 'dashboard.stripe.com'].includes(url.hostname) ? url.href : null
  } catch { return null }
}
