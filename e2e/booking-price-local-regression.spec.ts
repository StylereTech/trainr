import { randomUUID } from 'node:crypto'
import { expect, test } from './fixtures/local-auth'

test.skip(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(process.env.BASE_URL || '') || !process.env.LOCAL_E2E_SECRET, 'Requires disposable loopback fixtures.')
test.use({ channel: process.env.LOCAL_E2E_CHANNEL || undefined })
const owned = new Map<string, { parent: string; trainer: string; sport: string; coupon?: string }>()
test.afterEach(async ({ localAuth }, testInfo) => {
  const record = owned.get(testInfo.testId)
  if (!record) return
  const db = localAuth.database
  await db.booking.deleteMany({ where: { parentProfile: { userId: record.parent } } })
  if (record.coupon) await db.coupon.deleteMany({ where: { id: record.coupon } })
  await db.user.deleteMany({ where: { id: { in: [record.parent, record.trainer] } } })
  await db.sport.deleteMany({ where: { id: record.sport } })
  owned.delete(testInfo.testId)
})

for (const width of [1440, 390]) test.describe(`booking price ${width}px`, () => {
  test.use({ viewport: { width, height: 1000 }, timezoneId: 'America/Los_Angeles' })
  for (const scenario of ['free', 'changed', 'exhausted', 'retry', 'timeout', 'malformed', 'stale', 'maximum'] as const) test(scenario, async ({ page, localAuth }, testInfo) => {
    const db = localAuth.database
    const parent = await localAuth.create('PARENT'), trainer = await localAuth.create('TRAINER')
    const parentProfile = await db.parentProfile.findUniqueOrThrow({ where: { userId: parent.id } })
    const id = randomUUID(), sport = await db.sport.create({ data: { name: `Synthetic ${id}`, slug: id } })
    const record = { parent: parent.id, trainer: trainer.id, sport: sport.id, coupon: '' }
    owned.set(testInfo.testId, record)
    await db.athleteProfile.create({ data: { parentProfileId: parentProfile.id, firstName: 'Synthetic', lastName: 'Athlete', dateOfBirth: new Date('2015-01-01'), goals: [], sports: { create: { sportId: sport.id } } } })
    const profile = await db.trainerProfile.update({ where: { userId: trainer.id }, data: { approvalStatus: 'APPROVED', isActive: true, timeZone: 'UTC',
      sports: { create: { sportId: sport.id } }, serviceOfferings: { create: { title: 'Price review session', sportId: sport.id, priceInCents: 6000, durationMinutes: 60 } },
      availabilitySlots: { create: Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, startTime: '09:00', endTime: '12:00' })) },
    }, include: { serviceOfferings: true } })
    const service = profile.serviceOfferings[0]
    if (scenario === 'maximum') await db.serviceOffering.update({ where: { id: service.id }, data: { priceInCents: 99999999 } })
    const coupon = await db.coupon.create({ data: { code: id.replaceAll('-', '').toUpperCase(), discountPercent: 100, maxUses: 1, createdById: trainer.id } })
    record.coupon = coupon.id
    await localAuth.signIn(parent)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    const expectSingleLineTotal = async (value: string) => {
      const total = page.getByTestId('booking-total')
      await expect(total).toHaveText(value)
      expect(await total.evaluate(element => {
        const range = document.createRange()
        range.selectNodeContents(element)
        return new Set(Array.from(range.getClientRects(), rect => rect.top)).size
      })).toBe(1)
    }
    let checkoutCalls = 0, quoteCalls = 0, release: (() => void) | undefined
    let held = false
    const delayed = new Promise<void>(resolve => { release = resolve })
    await page.route('**/api/payments/checkout', route => {
      checkoutCalls++
      return route.fulfill({ status: 503, json: { error: 'Synthetic checkout unavailable.' } })
    })
    await page.route('**/api/bookings/quote', async route => {
      quoteCalls++
      if (quoteCalls === 1 && scenario === 'retry') return route.fulfill({ status: 503, json: { error: 'Price temporarily unavailable.' } })
      if (quoteCalls === 1 && scenario === 'timeout') { await delayed; return route.abort().catch(() => {}) }
      if (quoteCalls === 1 && scenario === 'malformed') return route.fulfill({ json: { serviceOfferingId: 'wrong-service', couponCode: '', currency: 'usd', subtotalInCents: 6000, discountInCents: 0, totalAmountInCents: 6000 } })
      if (quoteCalls === 1 && scenario === 'stale') {
        const response = await route.fetch()
        held = true
        await delayed
        return route.fulfill({ response }).catch(() => {})
      }
      return route.continue()
    })
    try {
      await page.goto(`/book/${profile.slug}`)
      await page.getByRole('button', { name: /Price review session/ }).click()
      await page.getByRole('combobox').click()
      await page.getByRole('option', { name: /Synthetic Athlete/ }).click()
      const future = new Date()
      future.setUTCDate(future.getUTCDate() + 2)
      await page.getByRole('button', { name: `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][future.getUTCDay()]} ${future.getUTCDate()}`, exact: true }).click()
      await page.getByRole('button', { name: '09:00', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Review booking', exact: true })).toBeVisible()
      if (scenario === 'maximum') {
        await expect(page.getByText('Total due: $999,999.99', { exact: true })).toBeVisible()
        await expectSingleLineTotal('$999,999.99')
        await page.screenshot({ path: testInfo.outputPath('maximum-price-review.png'), fullPage: true })
      } else if (scenario === 'retry' || scenario === 'malformed' || scenario === 'timeout') {
        await expect(page.getByRole('button', { name: 'Book & Pay', exact: true })).toBeDisabled()
        await expect(page.getByRole('button', { name: 'Retry check', exact: true })).toBeVisible({ timeout: scenario === 'timeout' ? 20000 : 10000 })
        await expect(page.getByText('Payment collected at Stripe checkout', { exact: true })).toHaveCount(0)
        release?.()
        await page.getByRole('button', { name: 'Retry check', exact: true }).click()
        await expect(page.getByText('Total due: $60.00', { exact: true })).toBeVisible()
        await expect(page.getByRole('button', { name: 'Book & Pay', exact: true })).toBeEnabled()
      } else if (scenario === 'changed') {
        await expect(page.getByText('Total due: $60.00', { exact: true })).toBeVisible()
        await db.serviceOffering.update({ where: { id: service.id }, data: { priceInCents: 7000 } })
        await page.getByRole('button', { name: 'Book & Pay', exact: true }).click()
        await expect(page.getByText('Price changed or needs confirmation. Review the latest total before booking.', { exact: true })).toBeVisible()
        await expect(page.getByText('Total due: $70.00', { exact: true })).toBeVisible()
        await expectSingleLineTotal('$70.00')
        await expect(page.getByRole('button', { name: /^Price review session/ })).toContainText('$70.00')
        expect(await db.booking.count({ where: { parentProfileId: parentProfile.id } })).toBe(0)
        expect(checkoutCalls).toBe(0)
        await page.screenshot({ path: testInfo.outputPath('changed-price-review.png'), fullPage: true })
        await page.getByRole('button', { name: 'Book & Pay', exact: true }).click()
        await expect(page).toHaveURL(/\/parent\/dashboard$/)
        expect((await db.booking.findFirstOrThrow({ where: { parentProfileId: parentProfile.id } })).totalAmountInCents).toBe(7000)
        expect(checkoutCalls).toBe(1)
      } else {
        if (scenario === 'stale') await expect.poll(() => held).toBe(true)
        else await expect(page.getByText('Total due: $60.00', { exact: true })).toBeVisible()
        await page.getByLabel('Promo code', { exact: true }).fill(coupon.code)
        await expect(page.getByText('Promo applied: $60.00 off. Total due: $0.00', { exact: true })).toBeVisible()
        await expect(page.getByRole('button', { name: 'Confirm free booking', exact: true })).toBeEnabled()
        await expectSingleLineTotal('$0.00')
        expect((await db.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).currentUses).toBe(0)
        expect(await db.booking.count({ where: { parentProfileId: parentProfile.id } })).toBe(0)
        if (scenario === 'stale') {
          release?.()
          await page.getByLabel('Notes for the trainer', { exact: true }).fill('Synthetic quote race check')
          await expect(page.getByRole('button', { name: 'Confirm free booking', exact: true })).toBeEnabled()
          await expect(page.getByText('Total due: $60.00', { exact: true })).toHaveCount(0)
        } else if (scenario === 'exhausted') {
          await db.coupon.update({ where: { id: coupon.id }, data: { maxUses: 0 } })
          await page.getByRole('button', { name: 'Confirm free booking', exact: true }).click()
          await expect(page.getByRole('button', { name: 'Retry check', exact: true })).toBeVisible()
          await expect(page.getByRole('button', { name: 'Book & Pay', exact: true })).toBeDisabled()
          expect(await db.booking.count({ where: { parentProfileId: parentProfile.id } })).toBe(0)
          await page.getByLabel('Promo code', { exact: true }).fill('')
          await expect(page.getByText('Total due: $60.00', { exact: true })).toBeVisible()
        } else {
          await page.screenshot({ path: testInfo.outputPath('free-price-review.png'), fullPage: true })
          await page.getByRole('button', { name: 'Confirm free booking', exact: true }).click()
          await expect(page).toHaveURL(/\/parent\/dashboard$/)
          const saved = await db.booking.findFirstOrThrow({ where: { parentProfileId: parentProfile.id }, include: { payment: true } })
          expect(saved).toMatchObject({ status: 'CONFIRMED', totalAmountInCents: 0, payment: { amountInCents: 0, status: 'SUCCEEDED', stripeCheckoutSessionId: null } })
          expect((await db.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).currentUses).toBe(1)
        }
      }
      if (scenario !== 'changed') expect(checkoutCalls).toBe(0)
      expect(errors).toEqual([])
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    } finally { release?.() }
  })
})
