import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Cookie Policy', description: 'How Trainr uses cookies and tracking technologies.' }

export default function CookiesPage() {
  return (
    <div className="bg-white py-16">
      <div className="container max-w-3xl">
        <h1 className="text-3xl font-bold mb-2">Cookie Policy</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: March 1, 2026</p>

        <div className="prose prose-sm max-w-none text-gray-600 space-y-6">
          <section>
            <h2 className="text-lg font-semibold text-gray-900">What Are Cookies</h2>
            <p>Cookies are small text files stored on your device when you visit our website. They help us provide a better experience.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">How We Use Cookies</h2>
            <p><strong>Essential:</strong> Session cookies for authentication and security. These cannot be disabled.</p>
            <p><strong>Functional:</strong> Remember your preferences (filters, location) for a better browsing experience.</p>
            <p><strong>Analytics:</strong> We use anonymized analytics to understand how our platform is used and improve it.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">Managing Cookies</h2>
            <p>You can manage cookie preferences through your browser settings. Disabling cookies may affect some features of the platform.</p>
          </section>
        </div>
      </div>
    </div>
  )
}
