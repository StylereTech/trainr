import { randomUUID } from 'node:crypto'
import { expect, test } from './fixtures/local-auth'

test.skip(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(process.env.BASE_URL || '') || !process.env.LOCAL_E2E_SECRET, 'Local disposable database and synthetic sessions only.')
test.use({ channel: process.env.LOCAL_E2E_CHANNEL || undefined })

for (const width of [1440, 390]) {
  test.describe(`booking retry ${width}px`, () => {
    test.use({ viewport: { width, height: 900 }, timezoneId: 'UTC' })
    for (const scenario of ['lost', 'malformed', 'cancelled', 'free']) {
      test(`recovers ${scenario} committed response with one reservation`, async ({ page, localAuth }, testInfo) => {
        const db = localAuth.database
        const parent = await localAuth.create('PARENT'), trainer = await localAuth.create('TRAINER')
        await localAuth.signIn(parent)
        const sport = await db.sport.create({ data: { name: `Synthetic sport ${randomUUID()}`, slug: randomUUID() } })
        const tomorrow = new Date()
        tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
        const date = tomorrow.toISOString().slice(0, 10), day = tomorrow.getUTCDay()
        let couponId = ''
        try {
          const parentProfile = await db.parentProfile.findUniqueOrThrow({ where: { userId: parent.id } })
          await db.athleteProfile.create({ data: { parentProfileId: parentProfile.id, firstName: 'Synthetic', lastName: 'Athlete', dateOfBirth: new Date('2015-01-01'), goals: [], sports: { create: { sportId: sport.id } } } })
          const profile = await db.trainerProfile.update({ where: { userId: trainer.id }, data: { approvalStatus: 'APPROVED', isActive: true,
            sports: { create: { sportId: sport.id } }, serviceOfferings: { create: { title: 'Synthetic session', sportId: sport.id, priceInCents: 6000, durationMinutes: 60 } },
            availabilitySlots: { create: { dayOfWeek: day, startTime: '09:00', endTime: '12:00' } },
          } })
          const coupon = await db.coupon.create({ data: { code: randomUUID().replaceAll('-', '').toUpperCase(), discountPercent: scenario === 'free' ? 100 : 10, maxUses: 1, createdById: trainer.id } })
          couponId = coupon.id
          const bodies: string[] = []
          let checkoutCalls = 0
          await page.route('**/api/payments/checkout', route => {
            checkoutCalls++
            return route.fulfill({ status: 503, json: { error: 'Synthetic checkout unavailable. Booking remains unpaid.' } })
          })
          await page.route('**/api/bookings', async route => {
            if (route.request().method() !== 'POST') return route.continue()
            bodies.push(route.request().postData()!)
            const response = await route.fetch()
            expect(response.status()).toBe(201)
            if (bodies.length !== 1) return route.fulfill({ response })
            const saved = await response.json()
            if (scenario === 'cancelled') await db.booking.update({ where: { id: saved.id }, data: { status: 'CANCELLED' } })
            if (scenario === 'malformed') return route.fulfill({ status: 201, json: { id: saved.id } })
            return route.abort('failed')
          })
          await page.goto(`/book/${profile.slug}`)
          await expect(page.getByText('Payment collected at Stripe checkout', { exact: true })).toBeVisible()
          await expect(page.getByText('No charge until confirmation', { exact: true })).toHaveCount(0)
          await page.getByRole('button', { name: /Synthetic session/ }).click()
          await page.getByRole('combobox').click()
          await page.getByRole('option', { name: /Synthetic Athlete/ }).click()
          const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
          await page.getByRole('button', { name: `${days[day]} ${tomorrow.getUTCDate()}`, exact: true }).click()
          await page.getByRole('button', { name: '09:00', exact: true }).click()
          await page.getByLabel('Promo code', { exact: true }).fill(coupon.code)
          if (width < 1024) await page.getByRole('button', { name: /Booking summary/ }).click()
          await page.getByRole('button', { name: 'Book & Pay', exact: true }).click()
          await expect(page.getByRole('button', { name: 'Retry same reservation', exact: true })).toBeVisible()
          expect(checkoutCalls).toBe(0)
          await expect(page.getByLabel('Promo code', { exact: true })).toBeDisabled()
          for (const field of [page.getByRole('combobox'), page.getByLabel('Promo code', { exact: true }), page.getByLabel('Notes for the trainer', { exact: true })]) {
            await expect(field).toHaveCSS('color', 'rgb(2, 6, 23)')
            await expect(field).toHaveCSS('background-color', 'rgb(241, 245, 249)')
            await expect(field).toHaveCSS('opacity', '1')
          }
          await expect(page.getByRole('button', { name: '09:00', exact: true })).toBeDisabled()
          await expect(page.getByRole('link', { name: 'Check saved bookings', exact: true })).toBeVisible()
          expect(await db.booking.count({ where: { parentProfileId: parentProfile.id } })).toBe(1)
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
          await page.screenshot({ path: testInfo.outputPath('booking-uncertain.png'), fullPage: true })
          await page.getByRole('button', { name: 'Retry same reservation', exact: true }).click()
          await expect(page).toHaveURL(/\/parent\/dashboard$/)
          expect(bodies).toHaveLength(2)
          expect(bodies[0]).toBe(bodies[1])
          expect(checkoutCalls).toBe(['free', 'cancelled'].includes(scenario) ? 0 : 1)
          expect((await db.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).currentUses).toBe(1)
          expect(await db.bookingCreateRequest.count({ where: { parentProfileId: parentProfile.id } })).toBe(1)
          const saved = await db.booking.findFirstOrThrow({ where: { parentProfileId: parentProfile.id }, include: { payment: true } })
          expect(saved.date.toISOString().slice(0, 10)).toBe(date)
          expect(saved.status).toBe(scenario === 'free' ? 'CONFIRMED' : scenario === 'cancelled' ? 'CANCELLED' : 'PENDING')
          expect(saved.payment?.status || null).toBe(scenario === 'free' ? 'SUCCEEDED' : null)
          await page.reload()
          await expect(page.getByRole('heading', { name: 'My Athletes', exact: true })).toBeVisible()
          expect(await db.booking.count({ where: { parentProfileId: parentProfile.id } })).toBe(1)
        } finally {
          await db.booking.deleteMany({ where: { parentProfile: { userId: parent.id } } })
          await db.user.deleteMany({ where: { id: { in: [parent.id, trainer.id] } } })
          if (couponId) await db.coupon.deleteMany({ where: { id: couponId } })
          await db.sport.deleteMany({ where: { id: sport.id } })
        }
      })
    }
  })
}
