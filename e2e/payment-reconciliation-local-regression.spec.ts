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
for (const width of [1440, 390]) test.describe(`Payment recovery ${width}px`, () => {
  test.use({ viewport: { width, height: 1000 } })
  for (const scenario of ['success', 'lost-response', 'malformed', 'provider-failure', 'missing-identity'] as const) test(scenario, async ({ page, localAuth }, info) => {
    const db = localAuth.database
    const parent = await localAuth.create('PARENT'), trainer = await localAuth.create('TRAINER'), admin = await localAuth.create('ADMIN')
    const parentProfile = await db.parentProfile.findUniqueOrThrow({ where: { userId: parent.id } })
    const trainerProfile = await db.trainerProfile.findUniqueOrThrow({ where: { userId: trainer.id } })
    const id = randomUUID()
    const sport = await db.sport.create({ data: { name: `Recovery ${id}`, slug: id } })
    const service = await db.serviceOffering.create({ data: { trainerProfileId: trainerProfile.id, sportId: sport.id, title: 'Synthetic recovery session', priceInCents: 6000, durationMinutes: 60 } })
    owned.set(info.testId, { trainer: trainerProfile.id, service: service.id, sport: sport.id })
    const athlete = await db.athleteProfile.create({ data: { parentProfileId: parentProfile.id, firstName: 'Synthetic', lastName: 'Athlete', dateOfBirth: new Date('2015-01-01') } })
    const booking = await db.booking.create({ data: { parentProfileId: parentProfile.id, trainerProfileId: trainerProfile.id, serviceOfferingId: service.id, athleteProfileId: athlete.id,
      date: new Date('2020-01-01'), startTime: '09:00', endTime: '10:00', timeZone: 'UTC', startsAt: new Date('2020-01-01T09:00:00Z'), endsAt: new Date('2020-01-01T10:00:00Z'),
      status: 'PENDING', totalAmountInCents: 6000, platformFeeInCents: 900, trainerPayoutInCents: 5100,
      payment: { create: { status: 'PENDING', amountInCents: 6000, platformFeeInCents: 900, trainerPayoutInCents: 5100 } } }, include: { payment: true } })
    let calls = 0
    // This suite exercises UI response handling. SQL integration tests verify the actual receipt chain.
    if (scenario !== 'missing-identity') await page.route('**/api/admin/payments/reconcile', async route => {
      calls++
      expect(route.request().postDataJSON()).toEqual({ bookingId: booking.id })
      if (scenario === 'success' || scenario === 'lost-response') {
        await db.payment.update({ where: { id: booking.payment!.id }, data: { status: 'SUCCEEDED' } })
        await db.booking.update({ where: { id: booking.id }, data: { status: 'CONFIRMED' } })
      }
      if (scenario === 'lost-response') return route.abort('failed')
      if (scenario === 'provider-failure') return route.fulfill({ status: 503, json: { error: 'Payment refresh could not be verified. Reload the booking before retrying; do not charge again.' } })
      return route.fulfill({ json: scenario === 'malformed' ? { ok: true } : { reconciled: true } })
    })
    await localAuth.signIn(admin)
    await page.goto('/admin/bookings')
    const refresh = page.getByRole('button', { name: 'Refresh payment', exact: true })
    await expect(refresh).toBeEnabled()
    await refresh.click()
    if (scenario === 'success') {
      await expect(page.getByText('Payment: SUCCEEDED', { exact: true })).toBeVisible()
      await expect(page.getByText('Payment records refreshed', { exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Complete', exact: true })).toBeEnabled()
      await expect(refresh).toBeEnabled()
    } else {
      await expect(page.getByRole('alert').filter({ has: page.getByRole('button', { name: 'Reload booking state', exact: true }) })).toBeVisible()
      await expect(refresh).toBeDisabled()
      await expect(page.getByRole('button', { name: 'Confirm', exact: true })).toBeDisabled()
      if (scenario === 'missing-identity') await expect(page.getByText('Saved checkout evidence requires manual review', { exact: false })).toBeVisible()
      await page.getByRole('button', { name: 'Reload booking state', exact: true }).click()
      await expect(refresh).toBeEnabled()
      await expect(page.getByText(`Payment: ${scenario === 'lost-response' ? 'SUCCEEDED' : 'PENDING'}`, { exact: true })).toBeVisible()
    }
    expect(calls).toBe(scenario === 'missing-identity' ? 0 : 1)
    expect((await db.payment.findUniqueOrThrow({ where: { id: booking.payment!.id } })).status).toBe(['success', 'lost-response'].includes(scenario) ? 'SUCCEEDED' : 'PENDING')
    await refresh.scrollIntoViewIfNeeded()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath('payment-recovery.png') })
    await page.reload()
    await expect(refresh).toBeEnabled()
  })
})
