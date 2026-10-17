import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Safety Guidelines', description: 'Trainr Safety Guidelines — our commitment to keeping young athletes safe.' }

export default function SafetyPage() {
  return (
    <div className="bg-white py-16 text-gray-900">
      <div className="container max-w-3xl">
        <h1 className="text-3xl font-bold mb-2">Safety Guidelines</h1>
        <p className="text-sm text-gray-600 mb-8">Last updated: October 8, 2026</p>

        <div className="prose prose-sm max-w-none text-gray-600 space-y-6">
          <section>
            <h2 className="text-lg font-semibold text-gray-900">Our Commitment to Safety</h2>
            <p>Profile approval does not establish identity or background screening. Do not treat a listing, a review, or a credential status as a guarantee of safety. Report safety concerns immediately.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">Credential Status</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>A credential marked verified refers only to that individual credential.</li>
              <li>Unverified credentials must not be treated as independently confirmed.</li>
              <li>Listing approval is not proof of criminal-record, sex-offender-registry, or identity checks.</li>
              <li>Trainr does not represent that every trainer has completed background screening or annual re-verification.</li>
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
            <p>To report a safety concern, email safety@trainr.app. For emergencies, always call 911 first. Do not wait for a platform response in an emergency.</p>
          </section>
        </div>
      </div>
    </div>
  )
}
