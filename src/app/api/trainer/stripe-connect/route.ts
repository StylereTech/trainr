import { NextRequest, NextResponse } from 'next/server'
import { GET as readConnect, POST as openConnect } from '@/app/api/payments/connect/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Preserve the legacy response shape while sharing identity and authorization rules.
export async function GET(req: NextRequest) {
  const response = await readConnect(req)
  if (!response.ok) return response
  const status = await response.json()
  return NextResponse.json({ connected: !!status.stripeAccountId && !status.providerError && status.providerConfigured,
    stripeConfigured: status.providerConfigured, hasAccount: !!status.stripeAccountId,
    chargesEnabled: status.chargesEnabled, payoutsEnabled: status.payoutsEnabled, detailsSubmitted: status.detailsSubmitted,
    onboardingComplete: status.stripeOnboardingComplete, error: status.providerError }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST(req: NextRequest) {
  const response = await openConnect(req)
  if (!response.ok) return response
  const result = await response.json()
  return NextResponse.json({ url: result.dashboardUrl || result.onboardingUrl }, { headers: { 'Cache-Control': 'private, no-store' } })
}
