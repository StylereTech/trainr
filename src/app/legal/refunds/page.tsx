import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Refund Policy', description: 'Trainr Refund Policy — cancellation and refund rules for training sessions.' }

export default function RefundPage() {
  return (
    <div className="bg-white py-16">
      <div className="container max-w-3xl">
        <h1 className="text-3xl font-bold mb-2">Refund Policy</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: October 17, 2026</p>

        <div className="prose prose-sm max-w-none text-gray-600 space-y-6">
          <section>
            <h2 className="text-lg font-semibold text-gray-900">Requesting a Refund</h2>
            <p>Cash refunds and promotional discount codes are handled by our support team, not issued automatically when a booking is cancelled. Email <a href="mailto:support@trainr.app" className="underline">support@trainr.app</a> from your account email with the booking or package purchase ID and the reason for your request. For a time-sensitive cancellation, contact us before the session starts. We review the booking time, cancellation, payment, and any prior refunds before confirming the amount. A cancellation notice or changed booking status is not a refund receipt.</p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-gray-900">Cancellation by Parent</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border">
                <thead><tr className="bg-gray-50"><th className="p-3 text-left">Time Before Session</th><th className="p-3 text-left">Refund</th></tr></thead>
                <tbody>
                  <tr className="border-t"><td className="p-3">At least 24 hours</td><td className="p-3 text-green-600 font-medium">Full refund</td></tr>
                  <tr className="border-t"><td className="p-3">Under 24 hours</td><td className="p-3 text-yellow-600 font-medium">50% refund</td></tr>
                  <tr className="border-t"><td className="p-3">No-show</td><td className="p-3 text-red-600 font-medium">No refund</td></tr>
                </tbody>
              </table>
            </div>
            <p>These amounts apply to a paid single-session booking after support verifies the cancellation against its scheduled start time. Cancelling a session funded with a package credit follows the package credit rules shown at booking; returning a credit is not a cash refund.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">Cancellation by Trainer</h2>
            <p>If a trainer cancels a paid single-session booking, you are eligible for a <strong>full refund</strong> after support verifies the cancellation and payment. If the trainer cancels under 4 hours before the scheduled start, support also provides a one-use 10% discount code for an eligible future booking after reviewing the case. Neither the refund nor the discount code is issued by the cancellation action itself.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">Package Refunds</h2>
            <p>A paid package that has not started may be requested for a full refund within 48 hours of purchase, after support verifies that no session has been completed or used. Packages are non-refundable after the first session has been completed. Cancelling an individual package-funded session may return a session credit under the credit rules, but does not automatically refund the package payment.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">Refund Status</h2>
            <p>Support will confirm the outcome and any refund reference after reviewing your request. An approved cash refund is submitted against the original Stripe payment; the time for funds to appear depends on the payment method and financial institution. A pending or failed refund is not a completed refund. Contact support if the confirmed refund does not appear.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">Disputes</h2>
            <p>If you believe a refund or credit was not handled correctly, email <a href="mailto:support@trainr.app" className="underline">support@trainr.app</a> with the booking or purchase ID and any Stripe refund reference. Please contact us within 14 days of the session where possible so we can investigate promptly.</p>
          </section>
        </div>
      </div>
    </div>
  )
}
