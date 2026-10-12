import { randomUUID } from 'node:crypto'
import { expect, test } from './fixtures/local-auth'

test.skip(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(process.env.BASE_URL || '') || !process.env.LOCAL_E2E_SECRET, 'Requires disposable loopback fixtures.')
test.use({ channel: process.env.LOCAL_E2E_CHANNEL || undefined })
const owned = new Map<string, { trainer: string; service: string; sport: string }>()
// Retry scoped cleanup before the auth fixture deletes users if a deadline interrupted finally.
test.afterEach(async ({ localAuth }, testInfo) => {
  const record = owned.get(testInfo.testId)
  if (!record) return
  const db = localAuth.database
  await db.booking.deleteMany({ where: { trainerProfileId: record.trainer } })
  await db.serviceOffering.deleteMany({ where: { id: record.service } })
  await db.sport.deleteMany({ where: { id: record.sport } })
  owned.delete(testInfo.testId)
})

for (const width of [1440, 390]) for (const role of ['TRAINER', 'ADMIN'] as const) test.describe(`${role} outcome ${width}px`, () => {
  test.use({ viewport: { width, height: 1000 }, timezoneId: 'America/Los_Angeles' })
  for (const scenario of ['future', 'ongoing', 'elapsed', 'unknown', 'revoked-parent'] as const) test(scenario, async ({ page, browser, localAuth }, testInfo) => {
    const db = localAuth.database
    const parent = await localAuth.create('PARENT'), trainer = await localAuth.create('TRAINER')
    const actor = role === 'ADMIN' ? await localAuth.create('ADMIN') : trainer
    const parentProfile = await db.parentProfile.findUniqueOrThrow({ where: { userId: parent.id } })
    const trainerProfile = await db.trainerProfile.findUniqueOrThrow({ where: { userId: trainer.id } })
    const id = randomUUID(), now = Date.now()
    const sport = await db.sport.create({ data: { name: `Outcome ${id}`, slug: id } })
    const service = await db.serviceOffering.create({ data: { trainerProfileId: trainerProfile.id, sportId: sport.id, title: 'Synthetic outcome session', priceInCents: 6000, durationMinutes: 60 } })
    owned.set(testInfo.testId, { trainer: trainerProfile.id, service: service.id, sport: sport.id })
    const athlete = await db.athleteProfile.create({ data: { parentProfileId: parentProfile.id, firstName: 'Synthetic', lastName: 'Athlete', dateOfBirth: new Date('2015-01-01') } })
    const start = new Date(now + (scenario === 'elapsed' || scenario === 'revoked-parent' ? -7200000 : scenario === 'ongoing' ? -1800000 : 7200000))
    const end = new Date(start.getTime() + 3600000)
    try {
      const booking = await db.booking.create({ data: {
        parentProfileId: parentProfile.id, trainerProfileId: trainerProfile.id, serviceOfferingId: service.id, athleteProfileId: athlete.id,
        date: new Date(`${start.toISOString().slice(0, 10)}T00:00:00Z`), startTime: start.toISOString().slice(11, 16), endTime: end.toISOString().slice(11, 16),
        timeZone: scenario === 'unknown' ? null : 'UTC', startsAt: scenario === 'unknown' ? null : start, endsAt: scenario === 'unknown' ? null : end,
        status: 'CONFIRMED', totalAmountInCents: 6000, platformFeeInCents: 900, trainerPayoutInCents: 5100,
        payment: { create: { status: 'SUCCEEDED', amountInCents: 6000, platformFeeInCents: 900, trainerPayoutInCents: 5100, settlementVerifiedAt: new Date() } },
      } })
      const paymentBefore = await db.payment.findUniqueOrThrow({ where: { bookingId: booking.id } })
      await localAuth.signIn(actor)
      // Only provider observations are mocked; session actions, authorization and persistence are real.
      await page.route('**/api/payments/connect', route => route.fulfill({ json: { providerConfigured: true, publishableKeyConfigured: true, stripeAccountId: null, stripeOnboardingComplete: false, chargesEnabled: null, payoutsEnabled: null, transfersEnabled: null, providerError: '', dashboardSupported: false, onboardingSupported: true } }))
      await page.route('**/api/trainer/wallet', route => route.fulfill({ json: { source: 'stripe', connected: false, wallet: null } }))
      await page.goto(role === 'TRAINER' ? '/trainer/dashboard' : '/admin/bookings')
      if (role === 'TRAINER') await page.getByRole('tab', { name: 'Confirmed (1)', exact: true }).click()
      const complete = page.getByRole('button', { name: 'Complete', exact: true })
      await expect(complete).toBeVisible()
      if (scenario === 'elapsed' || scenario === 'revoked-parent') await expect(complete).toBeEnabled()
      else await expect(complete).toBeDisabled()
      if (role === 'TRAINER') {
        const noShow = page.getByRole('button', { name: 'No-show', exact: true })
        if (scenario === 'elapsed' || scenario === 'ongoing' || scenario === 'revoked-parent') await expect(noShow).toBeEnabled()
        else await expect(noShow).toBeDisabled()
      }
      if (scenario === 'unknown') await expect(page.getByText('The original session time needs confirmation by support before recording an outcome.', { exact: true })).toBeVisible()
      await complete.scrollIntoViewIfNeeded()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      await page.screenshot({ path: testInfo.outputPath('outcome-controls.png') })
      if (scenario === 'revoked-parent') {
        await db.user.update({ where: { id: parent.id }, data: { role: 'TRAINER' } })
        await complete.click()
        await expect(page.getByRole('alert').filter({ hasText: 'A parent or trainer account is unavailable.' })).toBeVisible()
        expect((await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe('CONFIRMED')
        expect((await db.trainerProfile.findUniqueOrThrow({ where: { id: trainerProfile.id } })).totalSessions).toBe(0)
        expect(await db.notification.count({ where: { userId: parent.id } })).toBe(0)
        expect(await db.adminAction.count({ where: { targetId: booking.id } })).toBe(0)
        await page.screenshot({ path: testInfo.outputPath('revoked-parent-error.png') })
      } else if (scenario === 'future') {
        await page.clock.setFixedTime(new Date(now + 14400000))
        await expect(complete).toBeEnabled()
        await complete.click()
        await expect(page.getByRole('alert').filter({ hasText: 'This session has not ended yet.' })).toBeVisible()
        await expect(complete).toBeDisabled()
        expect((await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe('CONFIRMED')
        expect(await db.notification.count({ where: { userId: parent.id } })).toBe(0)
        expect(await db.adminAction.count({ where: { targetId: booking.id } })).toBe(0)
        expect((await db.trainerProfile.findUniqueOrThrow({ where: { id: trainerProfile.id } })).totalSessions).toBe(0)
      } else if (scenario === 'elapsed') {
        await complete.click()
        await expect.poll(async () => (await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe('COMPLETED')
        expect((await db.trainerProfile.findUniqueOrThrow({ where: { id: trainerProfile.id } })).totalSessions).toBe(1)
        expect(await db.notification.count({ where: { userId: parent.id, type: 'SESSION_COMPLETED' } })).toBe(1)
        await page.reload()
        await expect(page.getByRole('button', { name: 'Complete', exact: true })).toHaveCount(0)
        const parentContext = await browser.newContext({ baseURL: process.env.BASE_URL, viewport: { width, height: 1000 }, timezoneId: 'America/Los_Angeles' })
        try {
          await localAuth.signIn(parent, parentContext)
          const parentPage = await parentContext.newPage()
          await parentPage.goto('/parent/dashboard')
          await parentPage.getByRole('tab', { name: 'Past (1)', exact: true }).click()
          await expect(parentPage.getByRole('link', { name: 'Leave Review', exact: true })).toBeVisible()
        } finally { await parentContext.close() }
      } else if (scenario === 'ongoing' && role === 'TRAINER') {
        await page.getByRole('button', { name: 'No-show', exact: true }).click()
        await expect.poll(async () => (await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe('NO_SHOW')
        expect((await db.trainerProfile.findUniqueOrThrow({ where: { id: trainerProfile.id } })).totalSessions).toBe(0)
        expect(await db.notification.count({ where: { userId: parent.id, type: 'NO_SHOW' } })).toBe(1)
      }
      expect(await db.payment.findUniqueOrThrow({ where: { bookingId: booking.id } })).toEqual(paymentBefore)
    } finally {
      await db.booking.deleteMany({ where: { trainerProfileId: trainerProfile.id } })
      await db.serviceOffering.deleteMany({ where: { id: service.id } })
      await db.sport.deleteMany({ where: { id: sport.id } })
      owned.delete(testInfo.testId)
    }
  })
})
