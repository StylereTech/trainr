import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Toaster } from '@/components/ui/toaster'
import { AuthProvider } from '@/components/providers/AuthProvider'
import { Navbar } from '@/components/layout/Navbar'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: {
    default: 'Trainr — Find Youth Sports Trainers Near You',
    template: '%s | Trainr',
  },
  description: 'Connect with vetted, qualified sports trainers for football, baseball, basketball, soccer, and track & field. Book sessions, track progress, and help your athlete excel.',
  keywords: ['youth sports', 'sports training', 'football trainer', 'baseball trainer', 'basketball trainer', 'soccer trainer', 'track and field coach'],
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://trainr.app',
    siteName: 'Trainr',
    title: 'Trainr — Find Youth Sports Trainers Near You',
    description: 'Connect with vetted, qualified sports trainers for your young athlete.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Trainr — Find Youth Sports Trainers Near You',
    description: 'Connect with vetted, qualified sports trainers for your young athlete.',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className={inter.className}>
        <AuthProvider>
          <div className="flex min-h-screen flex-col">
            <Navbar />
            <main className="flex-1">{children}</main>
          </div>
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  )
}
