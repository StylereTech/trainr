import { NextResponse } from 'next/server'

// Coupon eligibility now requires an authenticated, service-specific booking quote.
export async function POST() {
  return NextResponse.json({
    error: 'Coupon validation has moved. Sign in as a parent and select a service to review its current price.',
    code: 'COUPON_ENDPOINT_RETIRED',
    quoteEndpoint: '/api/bookings/quote',
  }, { status: 410, headers: { 'Cache-Control': 'private, no-store' } })
}
