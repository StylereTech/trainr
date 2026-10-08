import { formatCurrency } from '@/lib/utils'

export type RefundSummaryPayment = {
  status: string
  refundAmountInCents?: number
  refundPendingAmountInCents?: number
  refundFailedCount?: number
  refundsVerifiedAt?: string | null
}

export function RefundSummary({ payment }: { payment?: RefundSummaryPayment | null }) {
  if (!payment || (!payment.refundsVerifiedAt && !payment.refundAmountInCents && !payment.refundPendingAmountInCents && !payment.refundFailedCount && !['REFUNDED', 'PARTIALLY_REFUNDED'].includes(payment.status))) return null
  if (!payment.refundsVerifiedAt) return <p data-testid="refund-summary" className="mt-2 text-xs text-amber-200">Recorded refund needs Stripe verification.</p>
  return <div data-testid="refund-summary" className="mt-2 space-y-1 text-xs leading-5">
    <p className="text-slate-200">Successful refunds: {formatCurrency(payment.refundAmountInCents || 0)}</p>
    {!!payment.refundPendingAmountInCents && <p className="text-amber-200">Pending refund: {formatCurrency(payment.refundPendingAmountInCents)}. Not yet completed.</p>}
    {!!payment.refundFailedCount && <p className="text-rose-200">{payment.refundFailedCount} refund(s) failed or cancelled. Contact support for unresolved amounts.</p>}
    <p className="text-slate-400">Checked {new Date(payment.refundsVerifiedAt).toLocaleString()}</p>
  </div>
}
