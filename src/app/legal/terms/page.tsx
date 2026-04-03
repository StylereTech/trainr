import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Terms of Service', description: 'Trainr Terms of Service.' }

export default function TermsPage() {
  return (
    <div className="bg-white py-16">
      <div className="container max-w-3xl">
        <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: March 1, 2026</p>

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
            <p>Bookings are requests subject to trainer acceptance. Cancellations made more than 24 hours before the session receive a full refund. Late cancellations may be subject to a cancellation fee. No-shows are non-refundable.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">5. Payments</h2>
            <p>All payments are processed securely through Stripe. Parents are charged at the time of booking confirmation. Trainers receive payment after session completion, minus the platform fee and processing fees.</p>
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
