import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Safety Guidelines', description: 'Trainr Safety Guidelines — our commitment to keeping young athletes safe.' }

export default function SafetyPage() {
  return (
    <div className="bg-white py-16">
      <div className="container max-w-3xl">
        <h1 className="text-3xl font-bold mb-2">Safety Guidelines</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: March 1, 2026</p>

        <div className="prose prose-sm max-w-none text-gray-600 space-y-6">
          <section>
            <h2 className="text-lg font-semibold text-gray-900">Our Commitment to Safety</h2>
            <p>Safety is our top priority. Every trainer on Trainr has passed a comprehensive background check and identity verification. We maintain strict safety standards and encourage all users to report concerns immediately.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">Trainer Verification</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>National criminal background check</li>
              <li>Sex offender registry check</li>
              <li>Identity verification (government ID)</li>
              <li>Credential and certification verification</li>
              <li>Annual re-verification</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">For Parents</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>Always review trainer profiles, reviews, and certifications before booking</li>
              <li>Supervise children during training sessions, especially for first sessions</li>
              <li>Meet in public locations for first sessions</li>
              <li>Use in-app messaging — never share personal contact information</li>
              <li>Report any safety concern immediately to safety@trainr.app</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">For Trainers</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>Maintain professional boundaries at all times</li>
              <li>Never be alone with a minor in an isolated location</li>
              <li>Use in-app messaging for all communication</li>
              <li>Report any safety concern about a child immediately</li>
              <li>Keep certifications and background checks current</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">Reporting</h2>
            <p>To report a safety concern: email safety@trainr.app or use the in-app report button. Our safety team responds within 4 hours. For emergencies, always call 911 first.</p>
          </section>
        </div>
      </div>
    </div>
  )
}
