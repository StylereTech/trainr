import { bookingPaymentHold, type BookingPaymentState } from '@/lib/booking-payment-hold'

export function PaymentHoldSummary({ booking }: { booking: { totalAmountInCents: number; payment: BookingPaymentState | null } }) {
  const hold = bookingPaymentHold(booking)
  return hold ? <p className="mt-2 max-w-lg break-words text-xs text-amber-200">{hold}</p> : null
}
