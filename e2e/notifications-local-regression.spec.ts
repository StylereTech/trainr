import { randomUUID } from 'node:crypto'
import { expect, test } from './fixtures/local-auth'

test.skip(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(process.env.BASE_URL || '') || !process.env.LOCAL_E2E_SECRET, 'Requires disposable loopback fixtures.')
test.use({ channel: process.env.LOCAL_E2E_CHANNEL || undefined })

for (const width of [1440, 390]) for (const role of ['PARENT', 'TRAINER', 'ADMIN'] as const) {
  test.describe(`${role} inbox ${width}px`, () => {
    test.use({ viewport: { width, height: 1000 } })
    test('renders recipient financial notices, pages beyond fifty, and persists read state without changing money', async ({ page, localAuth }, testInfo) => {
      const db = localAuth.database
      const parent = await localAuth.create('PARENT'), trainer = await localAuth.create('TRAINER')
      const actor = role === 'ADMIN' ? await localAuth.create('ADMIN') : role === 'PARENT' ? parent : trainer
      const parentProfile = await db.parentProfile.findUniqueOrThrow({ where: { userId: parent.id } })
      const trainerProfile = await db.trainerProfile.findUniqueOrThrow({ where: { userId: trainer.id } })
      const id = randomUUID()
      const sport = await db.sport.create({ data: { name: id, slug: id } })
      const service = await db.serviceOffering.create({ data: { trainerProfileId: trainerProfile.id, sportId: sport.id, title: 'Synthetic session', durationMinutes: 60, priceInCents: 6000 } })
      const athlete = await db.athleteProfile.create({ data: { parentProfileId: parentProfile.id, firstName: 'Synthetic', lastName: 'Athlete', dateOfBirth: new Date('2015-01-01') } })
      const booking = await db.booking.create({ data: { parentProfileId: parentProfile.id, trainerProfileId: trainerProfile.id, athleteProfileId: athlete.id, serviceOfferingId: service.id,
        date: new Date('2030-11-01'), startTime: '09:00', endTime: '10:00', status: 'CONFIRMED', totalAmountInCents: 6000, platformFeeInCents: 900, trainerPayoutInCents: 5100,
        payment: { create: { amountInCents: 6000, platformFeeInCents: 900, trainerPayoutInCents: 5100, status: 'SUCCEEDED' } } } })
      try {
        await db.notification.createMany({ data: Array.from({ length: 55 }, (_, i) => ({ userId: actor.id, title: `Saved notice ${i}`, message: 'Synthetic notification', type: 'NEW_MESSAGE', createdAt: new Date('2026-01-01') })) })
        const warning = await db.notification.create({ data: { userId: actor.id, title: 'Payment requires review', type: 'PAYMENT_REVIEW_REQUIRED',
          message: 'A transfer was reversed. This notice is not a bank payout receipt.', data: { bookingId: booking.id, private: 'do-not-display', financialReview: {
            chargeId: 'ch_' + 'long'.repeat(25), transferId: 'tr_synthetic', feeId: 'fee_synthetic', destination: 'acct_synthetic', refundedInCents: 0, transferReversedInCents: 600, feeRefundedInCents: 100,
            disputes: [{ id: 'du_synthetic', status: 'needs_response', amountInCents: 6000, dueBy: 1792000000, balanceTransactions: [{ id: 'txn_synthetic', amountInCents: -6000, feeInCents: 1500, netInCents: -7500 }] }],
          } } } })
        const outsider = await localAuth.create('PARENT')
        await db.notification.create({ data: { userId: outsider.id, title: 'PRIVATE OTHER ACCOUNT', type: 'NEW_MESSAGE', message: 'not yours' } })
        await localAuth.signIn(actor)
        await page.goto('/notifications')
        await expect(page.getByRole('heading', { name: 'Notifications', exact: true })).toBeVisible()
        await expect(page.getByRole('link', { name: 'Notifications', exact: true })).toBeVisible()
        await expect(page.getByText('56 unread', { exact: true })).toBeVisible()
        const colors = await page.getByRole('button', { name: 'Mark page read' }).evaluate(button => {
          const style = getComputedStyle(button)
          return { background: style.backgroundColor, foreground: style.color }
        })
        expect(colors).toEqual({ background: 'rgb(255, 255, 255)', foreground: 'rgb(24, 24, 27)' })
        await expect(page.getByText('PRIVATE OTHER ACCOUNT')).toHaveCount(0)
        const row = page.getByTestId('notification-row').filter({ hasText: 'Payment requires review' })
        await row.getByText('Recorded payment details', { exact: true }).click()
        await expect(row).toContainText('Transfer reversed: $6.00')
        await expect(row).toContainText('needs response: $60.00')
        await expect(row).toContainText('Evidence deadline:')
        await expect(row).not.toContainText('do-not-display')
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
        await page.screenshot({ path: testInfo.outputPath('financial-inbox.png') })
        await row.getByRole('button', { name: 'Mark read', exact: true }).click()
        await expect(page.getByText('55 unread', { exact: true })).toBeVisible()
        expect((await db.notification.findUniqueOrThrow({ where: { id: warning.id } })).readAt).not.toBeNull()
        await page.reload()
        await expect(row.getByRole('button', { name: 'Mark unread', exact: true })).toBeVisible()
        await page.getByRole('button', { name: 'Unread', exact: true }).click()
        await expect(row).toHaveCount(0)
        await page.getByRole('button', { name: 'Next notification page' }).click()
        await expect(page.getByRole('navigation', { name: 'Notification pages' })).toContainText('Page 2 of 3 (55 notifications)')
        await page.getByRole('button', { name: 'Next notification page' }).click()
        await expect(page.getByTestId('notification-row')).toHaveCount(15)
        await page.getByRole('button', { name: 'Mark page read' }).click()
        await expect(page.getByText('40 unread', { exact: true })).toBeVisible()
        await expect(page.getByRole('navigation', { name: 'Notification pages' })).toContainText('Page 2 of 2 (40 notifications)')
        await page.reload()
        await expect(page.getByText('40 unread', { exact: true })).toBeVisible()
        await row.getByRole('button', { name: 'Mark unread', exact: true }).click()
        await expect(page.getByText('41 unread', { exact: true })).toBeVisible()
        expect((await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe('CONFIRMED')
        expect((await db.payment.findUniqueOrThrow({ where: { bookingId: booking.id } })).status).toBe('SUCCEEDED')
      } finally {
        await db.booking.delete({ where: { id: booking.id } }); await db.serviceOffering.delete({ where: { id: service.id } }); await db.sport.delete({ where: { id: sport.id } })
      }
    })
  })
}
for (const width of [320, 1024]) {
  test.describe(`inbox recovery ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } })
    test('recovers failed/malformed reads and uncertain committed writes without false empty or read states', async ({ page, localAuth }, testInfo) => {
      const user = await localAuth.create('PARENT')
      await localAuth.signIn(user)
      const notice = await localAuth.database.notification.create({ data: { userId: user.id, type: 'NEW_MESSAGE', title: 'A'.repeat(100), message: '<script>window.bad = true</script>' } })
      let mode = 'fail'
      await page.route('**/api/notifications?*', route => mode === 'fail' ? route.fulfill({ status: 503, json: {} }) : mode === 'malformed' ? route.fulfill({ json: {} }) : route.continue())
      await page.goto('/notifications')
      await expect(page.getByRole('alert').filter({ hasText: 'Unable to load notifications' })).toBeVisible()
      await expect(page.getByText('No notifications yet.')).toHaveCount(0)
      mode = 'malformed'
      await page.getByRole('button', { name: 'Reload inbox' }).click()
      await expect(page.getByRole('alert').filter({ hasText: 'Unable to load notifications' })).toBeVisible()
      mode = 'ok'
      await page.getByRole('button', { name: 'Reload inbox' }).click()
      await expect(page.getByText('1 unread', { exact: true })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      expect(await page.evaluate(() => 'bad' in window)).toBe(false)
      await page.screenshot({ path: testInfo.outputPath('inbox-narrow.png'), fullPage: true })
      let writes = 0
      await page.route('**/api/notifications', async route => {
        if (route.request().method() !== 'PATCH') return route.continue()
        writes++
        const response = await route.fetch(); expect(response.status()).toBe(200)
        await localAuth.database.notification.create({ data: { userId: user.id, type: 'NEW_MESSAGE', title: 'Later arrival', message: 'Still unread' } })
        await route.abort('failed')
      })
      await page.getByRole('button', { name: 'Mark read', exact: true }).click()
      await expect(page.getByRole('alert').filter({ hasText: 'Unable to confirm this change' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Mark read', exact: true })).toBeDisabled()
      expect((await localAuth.database.notification.findUniqueOrThrow({ where: { id: notice.id } })).readAt).not.toBeNull()
      await page.getByRole('button', { name: 'Reload inbox' }).click()
      await expect(page.getByText('1 unread', { exact: true })).toBeVisible()
      await expect(page.getByTestId('notification-row').filter({ hasText: 'Later arrival' }).getByRole('button', { name: 'Mark read', exact: true })).toBeEnabled()
      expect(writes).toBe(1)
    })
  })
}
test('requires authentication and clears inbox data after session revocation', async ({ page, localAuth }) => {
  expect((await page.request.get('/api/notifications')).status()).toBe(401)
  await page.goto('/notifications')
  await expect(page).toHaveURL(/\/auth\/signin/)
  const user = await localAuth.create('PARENT')
  await localAuth.signIn(user)
  await page.goto('/notifications')
  await expect(page.getByText('No notifications yet.')).toBeVisible()
  await localAuth.database.user.update({ where: { id: user.id }, data: { sessionVersion: { increment: 1 } } })
  await page.getByRole('button', { name: 'Refresh notifications' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Unable to load notifications' })).toBeVisible()
  await expect(page.getByText('No notifications yet.')).toHaveCount(0)
  await page.reload()
  await expect(page).toHaveURL(/\/auth\/signin/)
})
