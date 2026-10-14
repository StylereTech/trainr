import { randomUUID } from 'node:crypto'
import { expect, test } from './fixtures/local-auth'

test.skip(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(process.env.BASE_URL || '') || !process.env.LOCAL_E2E_SECRET, 'Requires disposable loopback fixtures.')
test.use({ channel: process.env.LOCAL_E2E_CHANNEL || undefined })
const owned = new Map<string, { trainer: string; service: string; sport: string }>()
test.afterEach(async ({ localAuth }, info) => {
  const record = owned.get(info.testId)
  if (!record) return
  await localAuth.database.booking.deleteMany({ where: { trainerProfileId: record.trainer } })
  await localAuth.database.serviceOffering.deleteMany({ where: { id: record.service } })
  await localAuth.database.sport.deleteMany({ where: { id: record.sport } })
  owned.delete(info.testId)
})

for (const width of [1440, 390]) for (const role of ['PARENT', 'TRAINER', 'ADMIN'] as const) {
  test.describe(`${role} payment hold ${width}px`, () => {
    test.use({ viewport: { width, height: 1000 } })
    for (const kind of ['review', 'unverified']) test(kind, async ({ page, localAuth }, testInfo) => {
      const db = localAuth.database
      const parent = await localAuth.create('PARENT'), trainer = await localAuth.create('TRAINER')
      const actor = role === 'ADMIN' ? await localAuth.create('ADMIN') : role === 'PARENT' ? parent : trainer
      const pp = await db.parentProfile.findUniqueOrThrow({ where: { userId: parent.id } })
      const tp = await db.trainerProfile.findUniqueOrThrow({ where: { userId: trainer.id } })
      const id = randomUUID()
      const sport = await db.sport.create({ data: { name: id, slug: id } })
      const service = await db.serviceOffering.create({ data: { trainerProfileId: tp.id, sportId: sport.id, title: 'Synthetic held payment', priceInCents: 6000, durationMinutes: 60 } })
      owned.set(testInfo.testId, { trainer: tp.id, service: service.id, sport: sport.id })
      const athlete = await db.athleteProfile.create({ data: { parentProfileId: pp.id, firstName: 'Synthetic', lastName: 'Athlete', dateOfBirth: new Date('2015-01-01') } })
      const booking = await db.booking.create({ data: { parentProfileId: pp.id, trainerProfileId: tp.id, athleteProfileId: athlete.id,
        serviceOfferingId: service.id, date: new Date('2020-01-01'), startTime: '09:00', endTime: '10:00', timeZone: 'UTC',
        startsAt: new Date('2020-01-01T09:00:00Z'), endsAt: new Date('2020-01-01T10:00:00Z'),
        totalAmountInCents: 6000, platformFeeInCents: 900, trainerPayoutInCents: 5100,
        payment: { create: { status: 'SUCCEEDED', amountInCents: 6000, platformFeeInCents: 900, trainerPayoutInCents: 5100,
          settlementVerifiedAt: kind === 'review' ? new Date() : null,
          ...(kind === 'review' ? { financialReview: { key: 'synthetic-held-review', details: { chargeId: 'ch_private_review' } } } : {}) } },
      } })
      const paymentBefore = await db.payment.findUniqueOrThrow({ where: { bookingId: booking.id } })
      await localAuth.signIn(actor)
      await page.route('**/api/payments/connect', route => route.fulfill({ json: { providerConfigured: true, publishableKeyConfigured: true, stripeAccountId: null, stripeOnboardingComplete: false, chargesEnabled: null, payoutsEnabled: null, transfersEnabled: null, providerError: '', dashboardSupported: false, onboardingSupported: true } }))
      await page.route('**/api/trainer/wallet', route => route.fulfill({ json: { source: 'stripe', connected: false, wallet: null } }))
      const path = role === 'PARENT' ? '/parent/dashboard' : role === 'TRAINER' ? '/trainer/dashboard' : '/admin/bookings'
      const warning = kind === 'review' ? 'Payment needs reconciliation before this session can be confirmed or completed.'
        : 'Payment verification is required. Contact support to reconcile the saved Stripe receipt.'
      await page.goto(path)
      await expect(page.getByText(warning, { exact: true })).toBeVisible()
      if (role !== 'PARENT') {
        await expect(page.getByRole('button', { name: 'Confirm', exact: true })).toBeDisabled()
        const response = await page.request.patch(role === 'ADMIN' ? '/api/admin/bookings' : `/api/bookings/${booking.id}`,
          { data: { action: 'confirm', ...(role === 'ADMIN' ? { bookingId: booking.id } : {}) } })
        expect(response.status()).toBe(409)
      } else {
        await expect(page.getByText('Paid', { exact: true })).toHaveCount(0)
        await expect(page.getByRole('button', { name: 'Pay now', exact: true })).toHaveCount(0)
      }
      if (role !== 'ADMIN') {
        const response = await page.request.get(`/api/dashboard/bookings?view=${role === 'PARENT' ? 'upcoming' : 'all'}`)
        expect(response.status()).toBe(200)
        const data = await response.json()
        expect(data.bookings[0].payment.financialReview).toBe(kind === 'review')
        expect(JSON.stringify(data)).not.toContain('ch_private_review')
        const legacy = await page.request.get('/api/bookings')
        expect(legacy.status()).toBe(200)
        expect(legacy.headers()['cache-control']).toBe('private, no-store')
        const legacyData = await legacy.json()
        expect(legacyData.bookings[0].payment.financialReview).toBe(kind === 'review')
        expect(JSON.stringify(legacyData)).not.toContain('ch_private_review')
      }
      expect((await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe('PENDING')
      await db.booking.update({ where: { id: booking.id }, data: { status: 'CONFIRMED' } })
      await page.reload()
      if (role === 'TRAINER') await page.getByRole('tab', { name: 'Confirmed (1)', exact: true }).click()
      await expect(page.getByText(warning, { exact: true })).toBeVisible()
      if (role !== 'PARENT') {
        await expect(page.getByRole('button', { name: 'Complete', exact: true })).toBeDisabled()
        if (role === 'TRAINER') await expect(page.getByRole('button', { name: 'No-show', exact: true })).toBeDisabled()
        const response = await page.request.patch(role === 'ADMIN' ? '/api/admin/bookings' : `/api/bookings/${booking.id}`,
          { data: { action: 'complete', ...(role === 'ADMIN' ? { bookingId: booking.id } : {}) } })
        expect(response.status()).toBe(409)
      }
      expect(await db.payment.findUniqueOrThrow({ where: { bookingId: booking.id } })).toEqual(paymentBefore)
      expect((await db.trainerProfile.findUniqueOrThrow({ where: { id: tp.id } })).totalSessions).toBe(0)
      expect(await db.notification.count({ where: { userId: parent.id } })).toBe(0)
      expect(await db.adminAction.count({ where: { targetId: booking.id } })).toBe(0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      const holdText = page.getByText(warning, { exact: true })
      await holdText.scrollIntoViewIfNeeded()
      await expect(holdText).toBeInViewport()
      const warningBounds = await holdText.boundingBox()
      expect(warningBounds!.x).toBeGreaterThanOrEqual(0)
      expect(warningBounds!.x + warningBounds!.width).toBeLessThanOrEqual(width)
      expect(warningBounds!.height).toBeGreaterThan(0)
      await testInfo.attach('warning-layout', { body: JSON.stringify({ role, kind, width, warningBounds }), contentType: 'application/json' })
      await page.screenshot({ path: testInfo.outputPath('payment-hold.png'), fullPage: true })
      await holdText.screenshot({ path: testInfo.outputPath('payment-hold-warning.png') })
    })
  })
}
