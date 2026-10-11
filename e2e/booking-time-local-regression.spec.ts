import { randomUUID } from 'node:crypto'
import { expect, test } from './fixtures/local-auth'

test.skip(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(process.env.BASE_URL || '') || !process.env.LOCAL_E2E_SECRET, 'Requires disposable loopback fixtures.')
test.use({ channel: process.env.LOCAL_E2E_CHANNEL || undefined })

const owned = new Map<string, { parent: string; trainer: string; sport: string; coupon: string }>()
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

for (const width of [1440, 390]) for (const perspective of ['parent', 'trainer']) test.describe(`booking time ${perspective} ${width}px`, () => {
  test.use({ viewport: { width, height: 1000 }, timezoneId: 'America/Los_Angeles' })
  test('books in the trainer zone and preserves the original time after profile edits', async ({ page, localAuth }, testInfo) => {
    const db = localAuth.database
    const parent = await localAuth.create('PARENT'), trainer = await localAuth.create('TRAINER')
    const parentProfile = await db.parentProfile.findUniqueOrThrow({ where: { userId: parent.id } })
    const id = randomUUID(), sport = await db.sport.create({ data: { name: `Synthetic ${id}`, slug: id } })
    const record = { parent: parent.id, trainer: trainer.id, sport: sport.id, coupon: '' }
    owned.set(testInfo.testId, record)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    {
      await db.athleteProfile.create({ data: { parentProfileId: parentProfile.id, firstName: 'Synthetic', lastName: 'Athlete', dateOfBirth: new Date('2015-01-01'), goals: [], sports: { create: { sportId: sport.id } } } })
      const profile = await db.trainerProfile.update({ where: { userId: trainer.id }, data: { approvalStatus: 'APPROVED', isActive: true,
        sports: { create: { sportId: sport.id } }, serviceOfferings: { create: { title: 'Time-zone session', sportId: sport.id, priceInCents: 6000, durationMinutes: 60 } },
        availabilitySlots: { create: Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, startTime: '09:00', endTime: '12:00' })) },
      }, include: { serviceOfferings: true } })
      const coupon = await db.coupon.create({ data: { code: id.replaceAll('-', '').toUpperCase(), discountPercent: 100, maxUses: 1, createdById: trainer.id } })
      record.coupon = coupon.id
      await localAuth.signIn(parent)
      await page.goto(`/book/${profile.slug}`)
      await expect(page.getByText('Booking unavailable: trainer time zone is not set.', { exact: true })).toBeVisible()
      if (width < 1024) await page.getByRole('button', { name: /Booking summary/ }).click()
      await expect(page.getByRole('button', { name: 'Book & Pay', exact: true })).toBeDisabled()
      await db.trainerProfile.update({ where: { id: profile.id }, data: { timeZone: 'America/New_York' } })
      await page.reload()
      await expect(page.getByText('Session time zone: America/New York', { exact: true })).toBeVisible()
      await page.getByRole('button', { name: /Time-zone session/ }).click()
      await page.getByRole('combobox').click()
      await page.getByRole('option', { name: /Synthetic Athlete/ }).click()
      const future = new Date()
      future.setUTCDate(future.getUTCDate() + 2)
      const date = future.toISOString().slice(0, 10)
      await page.getByRole('button', { name: `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][future.getUTCDay()]} ${future.getUTCDate()}`, exact: true }).click()
      await page.getByRole('button', { name: '09:00', exact: true }).click()
      await page.getByLabel('Promo code', { exact: true }).fill(coupon.code)
      if (width < 1024) await page.getByRole('button', { name: /Booking summary/ }).click()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: testInfo.outputPath('booking-zone-summary.png'), fullPage: true })
      await expect(page.getByText('Promo applied: $60.00 off. Total due: $0.00', { exact: true })).toBeVisible()
      await page.getByRole('button', { name: 'Confirm free booking', exact: true }).click()
      await expect(page).toHaveURL(/\/parent\/dashboard$/)
      const saved = await db.booking.findFirstOrThrow({ where: { parentProfileId: parentProfile.id }, include: { payment: true } })
      expect(saved.timeZone).toBe('America/New_York')
      expect(saved.date.toISOString().slice(0, 10)).toBe(date)
      expect(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }).format(saved.startsAt!)).toBe('09:00')
      expect(saved.endsAt!.getTime() - saved.startsAt!.getTime()).toBe(3600000)
      expect(saved.payment).toMatchObject({ status: 'SUCCEEDED', amountInCents: 0, stripeCheckoutSessionId: null })
      await db.trainerProfile.update({ where: { id: profile.id }, data: { timeZone: 'America/Los_Angeles' } })
      if (perspective === 'parent') {
        await page.reload()
        await expect(page.getByText('America/New_York', { exact: true })).toBeVisible()
        await expect(page.getByText('No payment due', { exact: true })).toBeVisible()
        const { id: _id, createdAt: _created, updatedAt: _updated, payment: _payment, ...copy } = saved
        await db.booking.create({ data: { ...copy, status: 'PENDING', totalAmountInCents: 6000, platformFeeInCents: 900, trainerPayoutInCents: 5100, timeZone: null, startsAt: null, endsAt: null } })
        await page.reload()
        await expect(page.getByText('This booking needs its original time zone confirmed by support before payment.', { exact: true })).toBeVisible()
        await expect(page.getByRole('button', { name: 'Pay now', exact: true })).toHaveCount(0)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        expect(errors).toEqual([])
        await page.screenshot({ path: testInfo.outputPath('booking-zone-readback.png'), fullPage: true })
        await db.booking.update({ where: { id: saved.id }, data: { status: 'COMPLETED' } })
        await page.reload()
        await page.getByRole('tab', { name: 'Past (1)', exact: true }).click()
        await expect(page.getByText('America/New_York', { exact: true })).toBeVisible()
        await expect(page.getByText('09:00 – 10:00', { exact: true })).toBeVisible()
      } else {
        await db.booking.update({ where: { id: saved.id }, data: { status: 'COMPLETED' } })
        await localAuth.signIn(trainer)
        await page.goto('/trainer/dashboard')
        await page.getByRole('tab', { name: 'Completed (1)', exact: true }).click()
        await expect(page.getByText('America/New_York', { exact: true })).toBeVisible()
        await page.reload()
        await page.getByRole('tab', { name: 'Completed (1)', exact: true }).click()
        await expect(page.getByText('America/New_York', { exact: true })).toBeVisible()
        await page.screenshot({ path: testInfo.outputPath('trainer-zone-readback.png'), fullPage: true })
        await page.goto(`/trainers/${profile.slug}`)
        await page.getByRole('tab', { name: 'Availability', exact: true }).click()
        await expect(page.getByText('Session time zone: America/Los_Angeles', { exact: true })).toBeVisible()
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      expect(errors).toEqual([])
    }
  })
})
