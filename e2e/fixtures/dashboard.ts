import { bookingStates, viewStates, type DashboardView } from '../../src/lib/dashboard-contract'

// Explicit synthetic DTO conversion for older business-UI fixtures, not production fallback behavior.
export function dashboardFixture(rows: any[], url: string) {
  const params = new URL(url).searchParams
  const view = params.get('view') as DashboardView
  const limit = Number(params.get('limit') || 10)
  const counts = Object.fromEntries(bookingStates.map(status => [status, rows.filter(row => row.status === status).length]))
  const filtered = rows.filter(row => (viewStates[view] as string[]).includes(row.status))
  const totalPages = Math.ceil(filtered.length / limit)
  const page = Math.min(Number(params.get('page') || 1), Math.max(1, totalPages))
  return { bookings: filtered.slice((page - 1) * limit, page * limit).map(row => ({ ...row, date: new Date(row.date).toISOString(), trainerPayoutInCents: row.trainerPayoutInCents ?? 5100, notes: row.notes ?? null, review: row.review ?? null,
    serviceOffering: { durationMinutes: 60, ...row.serviceOffering }, parentProfile: row.parentProfile || { user: { email: 'parent@example.test' } },
    trainerProfile: { ...row.trainerProfile, paymentReady: row.trainerProfile?.paymentReady ?? (!!row.trainerProfile?.stripeAccountId && !!row.trainerProfile?.stripeOnboardingComplete) },
    payment: row.payment ? { refundAmountInCents: 0, refundPendingAmountInCents: 0, refundFailedCount: 0, refundsVerifiedAt: null, ...row.payment } : null,
  })), counts, reviewsToLeave: rows.filter(row => row.status === 'COMPLETED' && !row.review).length, pagination: { page, limit, total: filtered.length, totalPages } }
}
