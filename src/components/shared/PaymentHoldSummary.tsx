import { bookingPaymentHold, type BookingFundingState } from '@/lib/booking-payment-hold'

export function PaymentHoldSummary({ booking }: { booking: BookingFundingState }) {
  const hold = bookingPaymentHold(booking)
  if (booking.creditFunding) return <div className="mt-2 max-w-lg break-words text-xs">
    <p className="text-slate-300">Package: {booking.creditFunding.packageTitle}</p>
    {booking.creditFunding.restoredAt
      ? <><p className="mt-1 text-emerald-300">Session credit returned</p><p className="mt-1 text-slate-400">Original expiry and package payment restrictions still apply.</p></>
      : hold ? <p className="mt-1 text-amber-200">{hold}</p> : <p className="mt-1 text-emerald-300">1 session credit used</p>}
  </div>
  return hold ? <p className="mt-2 max-w-lg break-words text-xs text-amber-200">{hold}</p> : null
}
