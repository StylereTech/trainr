import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Refund Policy', description: 'Trainr Refund Policy — cancellation and refund rules for training sessions.' }

export default function RefundPage() {
  return (
    <div className="bg-white py-16">
      <div className="container max-w-3xl">
        <h1 className="text-3xl font-bold mb-2">Refund Policy</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: March 1, 2026</p>

        <div className="prose prose-sm max-w-none text-gray-600 space-y-6">
          <section>
            <h2 className="text-lg font-semibold text-gray-900">Cancellation by Parent</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border">
                <thead><tr className="bg-gray-50"><th className="p-3 text-left">Time Before Session</th><th className="p-3 text-left">Refund</th></tr></thead>
                <tbody>
                  <tr className="border-t"><td className="p-3">More than 24 hours</td><td className="p-3 text-green-600 font-medium">Full refund</td></tr>
                  <tr className="border-t"><td className="p-3">Less than 24 hours</td><td className="p-3 text-yellow-600 font-medium">50% refund</td></tr>
                  <tr className="border-t"><td className="p-3">No-show</td><td className="p-3 text-red-600 font-medium">No refund</td></tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">Cancellation by Trainer</h2>
            <p>If a trainer cancels for any reason, you receive a <strong>full refund</strong> automatically. If the cancellation is within 4 hours of the session, you also receive a 10% credit toward your next booking.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">Package Refunds</h2>
            <p>Packages are non-refundable after the first session has been completed. Unused sessions in a package that has not yet started can be refunded in full within 48 hours of purchase.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">Refund Timeline</h2>
            <p>Refunds are processed within 3–5 business days and returned to the original payment method. Stripe processing time may vary.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">Disputes</h2>
            <p>If you believe a refund was not processed correctly, contact support@trainr.app within 14 days of the session date.</p>
          </section>
        </div>
      </div>
    </div>
  )
}
