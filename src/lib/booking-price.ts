import type { Coupon } from '@prisma/client'
import { calculateDiscount, isSupportedBookingTotal } from '@/lib/fees'

export class BookingPriceError extends Error {
  constructor(message: string, public readonly status = 400) { super(message) }
}

export const normalizeCouponCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '')

// Quote and reservation use the same calculation; only reservation consumes a coupon.
export function bookingPrice(price: number, minimum: number, sportId: string | null, couponRequested: boolean, coupon: Coupon | null, parentProfileId: string, now = new Date()) {
  if (!Number.isSafeInteger(price) || price < 0) throw new BookingPriceError('Service pricing requires correction', 409)
  if (price < minimum) throw new BookingPriceError('Service price is below the current platform minimum. Contact the trainer.', 409)
  let discount = 0
  if (couponRequested) {
    if (!coupon || !coupon.isActive || coupon.currentUses >= coupon.maxUses ||
        (coupon.expiresAt && coupon.expiresAt <= now) ||
        (coupon.applicableSportId && coupon.applicableSportId !== sportId) ||
        (coupon.recipientParentProfileId && coupon.recipientParentProfileId !== parentProfileId)) {
      throw new BookingPriceError('Coupon is invalid, expired, exhausted or does not apply to this sport')
    }
    const percent = coupon.discountPercent, fixed = coupon.discountAmountInCents
    if ((percent === null) === (fixed === null) ||
        (percent !== null && (!Number.isInteger(percent) || percent < 1 || percent > 100)) ||
        (fixed !== null && (!Number.isSafeInteger(fixed) || fixed <= 0))) {
      throw new BookingPriceError('Coupon discount requires correction')
    }
    discount = Math.min(price, calculateDiscount(price, percent, fixed))
  }
  const total = price - discount
  if (!isSupportedBookingTotal(total)) throw new BookingPriceError('Booking total must be zero or between $0.50 and $999,999.99. Change the promo code or contact support.')
  return { subtotalInCents: price, discountInCents: discount, totalAmountInCents: total }
}
