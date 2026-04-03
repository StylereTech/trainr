import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Privacy Policy', description: 'Trainr Privacy Policy — how we collect, use, and protect your data.' }

export default function PrivacyPage() {
  return (
    <div className="bg-white py-16">
      <div className="container max-w-3xl">
        <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: March 1, 2026</p>

        <div className="prose prose-sm max-w-none text-gray-600 space-y-6">
          <section>
            <h2 className="text-lg font-semibold text-gray-900">1. Information We Collect</h2>
            <p><strong>Account Information:</strong> Name, email, phone number, and password when you register.</p>
            <p><strong>Profile Information:</strong> Location, bio, certifications, sports specialties, and photos you upload.</p>
            <p><strong>Transaction Data:</strong> Booking details, payment information (processed by Stripe — we never store card numbers), and transaction history.</p>
            <p><strong>Usage Data:</strong> Pages visited, search queries, device information, and IP address for analytics and security.</p>
            <p><strong>Communications:</strong> Messages sent through our platform for safety and dispute resolution.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">2. How We Use Your Information</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>To provide and improve our marketplace services</li>
              <li>To facilitate bookings and payments between parents and trainers</li>
              <li>To verify identity and conduct background checks (trainers)</li>
              <li>To send booking confirmations, reminders, and notifications</li>
              <li>To provide customer support and resolve disputes</li>
              <li>To detect and prevent fraud, abuse, and safety issues</li>
              <li>To comply with legal obligations</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">3. Information Sharing</h2>
            <p>We do not sell your personal information. We share data with:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Stripe:</strong> For payment processing (card data goes directly to Stripe, never through our servers)</li>
              <li><strong>Service Providers:</strong> Email delivery, analytics, and infrastructure</li>
              <li><strong>Other Users:</strong> Trainers see parent names and athlete info for bookings; parents see trainer profiles</li>
              <li><strong>Legal Requirements:</strong> When required by law or to protect safety</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">4. Data Security</h2>
            <p>We use industry-standard encryption (TLS 1.3), secure infrastructure, and regular security audits. Passwords are hashed using bcrypt. Payment data is handled exclusively by Stripe (PCI DSS Level 1 compliant).</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">5. Your Rights</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>Access and download your personal data</li>
              <li>Correct inaccurate information</li>
              <li>Request deletion of your account and data</li>
              <li>Opt out of marketing communications</li>
              <li>Data portability (export your data)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">6. Children&apos;s Privacy</h2>
            <p>Our service is designed for parents/guardians to book trainers for minors. We do not knowingly collect personal information directly from children under 13. Athlete profiles are managed by parent accounts.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">7. Data Retention</h2>
            <p>We retain account data while your account is active. Transaction records are kept for 7 years for tax and legal compliance. You can request account deletion, after which data is removed within 30 days (except where legally required).</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">8. Contact</h2>
            <p>For privacy inquiries: privacy@trainr.app</p>
          </section>
        </div>
      </div>
    </div>
  )
}
