import { randomUUID } from 'node:crypto'
import { test, expect } from './fixtures/local-auth'

test.use({ channel: process.env.LOCAL_E2E_CHANNEL || 'chrome' })
for (const width of [1440, 390]) {
  test(`role revocation persists retirement for a non-deleted account ${width}px`, async ({ page, localAuth }, info) => {
    await page.setViewportSize({ width, height: 1000 })
    const admin = await localAuth.create('ADMIN'), parent = await localAuth.create('PARENT'), trainer = await localAuth.create('TRAINER')
    const parentProfile = await localAuth.database.parentProfile.findUniqueOrThrow({ where: { userId: parent.id } })
    const trainerProfile = await localAuth.database.trainerProfile.findUniqueOrThrow({ where: { userId: trainer.id } })
    const sport = await localAuth.database.sport.create({ data: { name: 'Synthetic retirement', slug: randomUUID() } })
    let bookingId: string | undefined
    try {
      const service = await localAuth.database.serviceOffering.create({ data: { trainerProfileId: trainerProfile.id, sportId: sport.id, title: 'Synthetic session', priceInCents: 6000 } })
      const athlete = await localAuth.database.athleteProfile.create({ data: { parentProfileId: parentProfile.id, firstName: 'Synthetic', lastName: 'Athlete', dateOfBirth: new Date('2015-01-01') } })
      const booking = await localAuth.database.booking.create({ data: { parentProfileId: parentProfile.id, trainerProfileId: trainerProfile.id,
        athleteProfileId: athlete.id, serviceOfferingId: service.id, date: new Date('2030-01-01'), startTime: '09:00', endTime: '10:00',
        totalAmountInCents: 6000, platformFeeInCents: 900, trainerPayoutInCents: 5100,
        payment: { create: { amountInCents: 6000, platformFeeInCents: 900, trainerPayoutInCents: 5100 } } }, include: { payment: true } })
      bookingId = booking.id
      await localAuth.signIn(admin)
      await page.goto('/admin/users')
      await page.getByLabel('Search users').fill(parent.email)
      await page.getByRole('button', { name: 'Search', exact: true }).click()
      await page.getByTestId('user-row').filter({ hasText: parent.email }).getByRole('button', { name: 'Change role' }).click()
      await page.getByRole('combobox', { name: 'New role' }).click()
      await page.getByRole('option', { name: 'Admin', exact: true }).click()
      await page.getByRole('button', { name: 'Update role' }).click()
      await expect(page.getByRole('dialog')).not.toBeVisible()
      expect(await localAuth.database.user.findUniqueOrThrow({ where: { id: parent.id } })).toMatchObject({ role: 'ADMIN', deletedAt: null })
      // No provider identity exists: the real worker records review without a Stripe call.
      const task = await localAuth.database.accountCheckoutClosure.findUniqueOrThrow({ where: { kind_targetId: { kind: 'BOOKING', targetId: booking.payment!.id } } })
      expect(task).toMatchObject({ status: 'REVIEW', outcome: 'missing_session_identity' })
      await page.getByRole('link', { name: 'Checkout closures', exact: true }).click()
      await expect(page.getByText(`Affected account: ${parent.id}`, { exact: true })).toBeVisible()
      await page.getByRole('button', { name: 'Verify and close', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Verify and close', exact: true })).toBeEnabled()
      await page.reload()
      await expect(page.getByText(`Affected account: ${parent.id}`, { exact: true })).toBeVisible()
      expect((await localAuth.database.accountCheckoutClosure.findUniqueOrThrow({ where: { id: task.id } })).status).toBe('REVIEW')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: info.outputPath('revocation-retirement.png'), fullPage: true })
    } finally {
      if (bookingId) await localAuth.database.booking.delete({ where: { id: bookingId } })
      await localAuth.database.serviceOffering.deleteMany({ where: { trainerProfileId: trainerProfile.id } })
      await localAuth.database.sport.delete({ where: { id: sport.id } })
    }
  })
}

for (const width of [1440, 390]) for (const scenario of ['success', 'lost-response', 'malformed', 'read-failure', 'empty', 'parent-denial'] as const) {
  test(`account checkout closures ${scenario} ${width}px`, async ({ page, localAuth }, info) => {
    await page.setViewportSize({ width, height: 1000 })
    const admin = await localAuth.create('ADMIN'), closed = await localAuth.create('PARENT')
    await localAuth.database.user.update({ where: { id: closed.id }, data: { deletedAt: new Date() } })
    const record = scenario === 'empty' ? null : await localAuth.database.accountCheckoutClosure.create({ data: { userId: closed.id, kind: 'BOOKING', targetId: randomUUID() } })
    await localAuth.signIn(scenario === 'parent-denial' ? await localAuth.create('PARENT') : admin)
    if (scenario === 'parent-denial') {
      expect((await page.request.get('/api/admin/checkout-closures')).status()).toBe(401)
      expect((await page.request.post('/api/admin/checkout-closures', { data: { id: record!.id } })).status()).toBe(401)
      await page.goto('/admin/checkout-closures'); await expect(page).toHaveURL(/\/parent\/dashboard$/); return
    }
    let calls = 0
    // Response handling uses explicit local fixtures; SQL tests verify Stripe identity and expiry.
    await page.route('**/api/admin/checkout-closures', async route => {
      calls++; expect(route.request().postDataJSON()).toEqual({ id: record!.id })
      if (scenario === 'malformed') return route.fulfill({ json: { ok: true } })
      await localAuth.database.accountCheckoutClosure.update({ where: { id: record!.id }, data: { status: 'CLOSED', outcome: 'expired_unpaid', sessionId: 'cs_synthetic', checkedAt: new Date() } })
      if (scenario === 'lost-response') return route.abort('failed')
      return route.fulfill({ json: { id: record!.id, status: 'CLOSED', outcome: 'expired_unpaid' } })
    })
    if (scenario === 'read-failure') await page.route('**/api/admin/checkout-closures?*', route => route.fulfill({ status: 503, json: { error: 'synthetic' } }))
    await page.goto('/admin/users')
    await page.getByRole('link', { name: 'Checkout closures', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Account checkout closures', exact: true })).toBeVisible()
    if (scenario === 'empty') { await expect(page.getByText('No account checkout closures.', { exact: true })).toBeVisible(); return }
    if (scenario === 'read-failure') {
      await expect(page.getByRole('alert').filter({ hasText: 'Unable to load current data' })).toBeVisible()
      await expect(page.getByText('No account checkout closures.', { exact: true })).toHaveCount(0)
      await page.unroute('**/api/admin/checkout-closures?*')
      await page.getByRole('button', { name: 'Reload closure queue', exact: true }).click()
    }
    const button = page.getByRole('button', { name: 'Verify and close', exact: true })
    await expect(button).toBeEnabled()
    await button.click()
    if (['lost-response', 'malformed'].includes(scenario)) {
      await expect(page.getByRole('alert').filter({ hasText: 'Closure result is unconfirmed' })).toBeVisible()
      await expect(button).toBeDisabled()
      await page.getByRole('button', { name: 'Reload closure queue', exact: true }).click()
    }
    await expect(page.getByText(scenario === 'malformed' ? 'Queued' : 'Expired unpaid', { exact: true })).toBeVisible()
    expect(calls).toBe(1)
    await page.reload()
    await expect(page.getByText(scenario === 'malformed' ? 'Queued' : 'Expired unpaid', { exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath('account-closures.png'), fullPage: true })
  })
}

for (const width of [1440, 390]) for (const scenario of ['success', 'lost-response', 'malformed'] as const) {
  test(`account deletion acknowledgement ${scenario} ${width}px`, async ({ page, localAuth }) => {
    const user = await localAuth.create('PARENT')
    await localAuth.signIn(user); await page.setViewportSize({ width, height: 1000 })
    await page.route('**/api/account', async route => {
      if (scenario === 'malformed') return route.fulfill({ json: { ok: true } })
      const response = await route.fetch(); expect(response.status()).toBe(200)
      if (scenario === 'lost-response') return route.abort('failed')
      return route.fulfill({ response })
    })
    await page.goto('/account/delete')
    await expect(page.getByText('Existing checkout links are queued for closure.', { exact: false })).toBeVisible()
    await page.getByLabel('Confirmation', { exact: true }).fill('DELETE')
    await page.getByRole('button', { name: 'Delete Account', exact: true }).click()
    if (scenario === 'success') await expect(page.getByText('Account deletion confirmed', { exact: true })).toBeVisible()
    else {
      await expect(page.getByRole('alert').filter({ hasText: 'Deletion could not be confirmed.' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Delete Account', exact: true })).toBeDisabled()
      await expect(page.getByRole('button', { name: 'Reload account settings', exact: true })).toBeVisible()
      await expect(page.getByText('Account deletion confirmed', { exact: true })).toHaveCount(0)
    }
    const stored = await localAuth.database.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(Boolean(stored.deletedAt)).toBe(scenario !== 'malformed')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}
