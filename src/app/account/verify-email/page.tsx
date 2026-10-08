import { Suspense } from 'react'
import type { Metadata } from 'next'
import VerificationForm from './verification-form'

export const metadata: Metadata = { title: 'Email verification', referrer: 'no-referrer', robots: { index: false, follow: false } }

export default function VerifyEmailPage() {
  return <Suspense fallback={<main className="container py-12">Loading verification...</main>}><VerificationForm /></Suspense>
}
