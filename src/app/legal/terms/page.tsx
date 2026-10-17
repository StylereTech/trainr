import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Terms of Service', description: 'Trainr Terms of Service.' }

export default function TermsPage() {
  return (
    <div className="bg-white py-16">
      <div className="container max-w-3xl">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Terms of Service</h1>
        <p className="text-sm text-gray-600 mb-8">Last updated: October 17, 2026</p>

        <div className="prose prose-sm max-w-none text-gray-600 space-y-6">
          <section>
            <h2 className="text-lg font-semibold text-gray-900">1. Acceptance of Terms</h2>
            <p>By accessing or using Trainr (&quot;the Platform&quot;), you agree to be bound by these Terms of Service. If you do not agree, do not use the Platform.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">2. Description of Service</h2>
            <p>Trainr is a marketplace connecting parents/guardians with independent youth sports trainers. We facilitate discovery, booking, payment, and communication but do not employ, supervise, or guarantee the services of any trainer.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">3. User Accounts</h2>
            <p>You must be at least 18 years old to create an account. You are responsible for maintaining the security of your account credentials. You must provide accurate and complete information when registering.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">4. Booking & Cancellation</h2>
            <p>Bookings are requests subject to trainer acceptance. For paid single sessions, parent cancellations at least 24 hours before the scheduled start are eligible for a full refund; cancellations under 24 hours are eligible for 50%. No-shows are non-refundable. Cash refunds are reviewed and issued through support, not by the cancellation action. Package-funded sessions follow the package credit rules. See the <a href="/legal/refunds" className="underline">Refund Policy</a> for requests and trainer cancellations.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">5. Payments</h2>
            <p>Online payments are processed through Stripe when a parent completes Checkout; a reservation alone does not charge the parent. A successful destination charge allocates the trainer share to the trainer&apos;s connected Stripe account, subject to Stripe account eligibility and payout timing. A platform transfer is not proof of a bank payout.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">6. Platform Fees</h2>
            <p>Trainr charges trainers a platform fee of 15% on each completed booking. This fee covers payment processing, marketplace operations, and support services.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">7. Reviews</h2>
            <p>Only users who have completed a booked session may leave a review. Reviews must be honest and based on actual experience. We reserve the right to remove reviews that violate our guidelines.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">8. Liability</h2>
            <p>Trainr is not liable for the conduct, performance, or actions of trainers or parents using the platform. Users participate at their own risk. We strongly recommend that parents supervise minors during all training sessions.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">9. Prohibited Conduct</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>Harassment, discrimination, or abusive behavior</li>
              <li>Fraudulent bookings or fake reviews</li>
              <li>Sharing personal contact information to bypass the platform</li>
              <li>Misrepresenting qualifications or identity</li>
              <li>Any illegal activity</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">10. Termination</h2>
            <p>We may suspend or terminate accounts that violate these Terms. You may delete your account at any time through your account settings.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">11. Changes to Terms</h2>
            <p>We may update these Terms from time to time. We will notify users of material changes via email or platform notification. Continued use after changes constitutes acceptance.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">12. Contact</h2>
            <p>For questions about these Terms, contact us at legal@trainr.app.</p>
          </section>
        </div>
      </div>
    </div>
  )
}
