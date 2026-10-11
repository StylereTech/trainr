"use client"

import { useEffect, useState } from 'react'
import { bookingQuoteSchema, type BookingQuote } from '@/lib/booking-quote-schema'
import { normalizeCouponCode } from '@/lib/booking-price'

export function useBookingQuote(serviceOfferingId: string, couponCode: string, enabled: boolean) {
  const key = JSON.stringify([serviceOfferingId, couponCode])
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<{ key: string; attempt: number; quote?: BookingQuote; error?: string } | null>(null)
  useEffect(() => {
    if (!serviceOfferingId || !enabled) return
    let active = true
    const controller = new AbortController()
    let timeout: ReturnType<typeof setTimeout>
    const debounce = setTimeout(async () => {
      timeout = setTimeout(() => controller.abort(), 15000)
      try {
        const response = await fetch('/api/bookings/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ serviceOfferingId, couponCode }), cache: 'no-store', signal: controller.signal })
        const body = await response.json()
        if (!response.ok) {
          if (active) setResult({ key, attempt, error: typeof body.error === 'string' ? body.error : 'Price could not be confirmed. Please retry.' })
          return
        }
        const quote = bookingQuoteSchema.parse(body)
        if (quote.serviceOfferingId !== serviceOfferingId || quote.couponCode !== normalizeCouponCode(couponCode)) throw new Error('Price response did not match the selected service and promo code.')
        if (active) setResult({ key, attempt, quote })
      } catch {
        if (active) setResult({ key, attempt, error: 'Price could not be confirmed. Check the promo code or retry.' })
      } finally { clearTimeout(timeout) }
    }, 350)
    return () => { active = false; clearTimeout(debounce); clearTimeout(timeout); controller.abort() }
  }, [serviceOfferingId, couponCode, enabled, key, attempt])
  const current = enabled && result?.key === key && result.attempt === attempt ? result : null
  return { quote: current?.quote, error: current?.error, loading: Boolean(enabled && serviceOfferingId && !current), refresh: () => setAttempt(value => value + 1) }
}
