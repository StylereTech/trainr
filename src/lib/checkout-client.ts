import { z } from 'zod'

export const checkoutResponseSchema = z.object({
  checkoutUrl: z.string().url().refine(value => {
    try {
      const url = new URL(value)
      return url.protocol === 'https:' && url.hostname === 'checkout.stripe.com' &&
        !url.username && !url.password && !url.port
    } catch { return false }
  }),
})

const checkoutErrorSchema = z.object({ error: z.string().trim().min(1).max(500) })
const uncertainMessage = 'Unable to open checkout. Check the saved booking and payment status before trying again.'

class CheckoutError extends Error {}

export async function requestCheckout(bookingId: string): Promise<string> {
  try {
    const response = await fetch('/api/payments/checkout', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId }), signal: AbortSignal.timeout(15000), redirect: 'error',
    })
    const data: unknown = await response.json()
    if (!response.ok) {
      const error = checkoutErrorSchema.safeParse(data)
      throw new CheckoutError(error.success ? error.data.error : uncertainMessage)
    }
    const parsed = checkoutResponseSchema.safeParse(data)
    if (!parsed.success) throw new CheckoutError(uncertainMessage)
    return parsed.data.checkoutUrl
  } catch (error) {
    if (error instanceof CheckoutError) throw error
    throw new CheckoutError(uncertainMessage)
  }
}
