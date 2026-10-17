import { randomUUID } from 'node:crypto'
import { expect, test } from './fixtures/local-auth'

test.skip(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(process.env.BASE_URL || '') || !process.env.LOCAL_E2E_SECRET,
  'Requires a disposable loopback database and local auth secret.')
test.use({ channel: process.env.LOCAL_E2E_CHANNEL || 'chrome' })

for (const width of [1440, 390]) test(`restricted trainer cannot create paid parent records at ${width}px`, async ({ page, localAuth }) => {
  test.setTimeout(90000)
  await page.setViewportSize({ width, height: 1000 })
  const db = localAuth.database
  const parent = await localAuth.create('PARENT')
  const trainer = await localAuth.create('TRAINER')
  const key = randomUUID()
  let sportId: string | undefined
  try {
    const parentProfile = await db.parentProfile.findUniqueOrThrow({ where: { userId: parent.id } })
    const sport = await db.sport.create({ data: { name: `Restricted ${key}`, slug: key } })
    sportId = sport.id
    const athlete = await db.athleteProfile.create({ data: { parentProfileId: parentProfile.id, firstName: 'Synthetic', lastName: 'Athlete', dateOfBirth: new Date('2015-01-01'), goals: [], sports: { create: { sportId: sport.id } } } })
    const profile = await db.trainerProfile.update({ where: { userId: trainer.id }, data: {
      approvalStatus: 'APPROVED', isActive: true, timeZone: 'UTC', stripeAccountId: `acct_${key.replaceAll('-', '')}`,
      stripeOnboardingComplete: false, sports: { create: { sportId: sport.id } },
      serviceOfferings: { create: { title: 'Restricted basketball session', sportId: sport.id, priceInCents: 5000, durationMinutes: 60 } },
      availabilitySlots: { create: Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, startTime: '09:00', endTime: '12:00' })) },
    }, include: { serviceOfferings: true } })
    const service = profile.serviceOfferings[0]
    const offer = await db.package.create({ data: { trainerProfileId: profile.id, title: 'Restricted family pack', description: 'Two shared sessions',
      totalSessions: 2, priceInCents: 9000, validForDays: 90, isActive: true,
      items: { create: { serviceOfferingId: service.id, sessionsCount: 2 } },
    } })
    await localAuth.signIn(parent)

    const review = await page.request.get(`/api/package-purchases/review?packageId=${encodeURIComponent(offer.id)}`)
    expect(review.status()).toBe(200)
    expect(await review.json()).toMatchObject({ amountInCents: 9000, canCheckout: false,
      hold: 'Trainer must finish Stripe setup before checkout.' })
    await page.goto(`/parent/packages/buy/${offer.id}`)
    await expect(page.getByRole('heading', { name: 'Restricted family pack' })).toBeVisible()
    await expect(page.getByText('Trainer must finish Stripe setup before checkout.', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Pay in full with Stripe' })).toHaveCount(0)

    const purchase = await page.request.post('/api/package-purchases/checkout', { data: {
      requestId: randomUUID(), packageId: offer.id, catalogRevision: offer.updatedAt.toISOString(), expectedTotalInCents: 9000,
    } })
    expect(purchase.status()).toBe(409)
    expect(await purchase.json()).toEqual({ error: 'Trainer must finish Stripe setup before checkout.' })
    expect(await db.packagePurchase.count({ where: { parentProfileId: parentProfile.id } })).toBe(0)

    const quote = await page.request.post('/api/bookings/quote', { data: { serviceOfferingId: service.id } })
    expect(quote.status()).toBe(409)
    expect(await quote.json()).toEqual({ error: 'Trainer must finish Stripe setup before a paid booking can be reserved.' })
    await page.goto(`/book/${profile.slug}`)
    await page.getByRole('button', { name: /Restricted basketball session/ }).click()
    await page.getByRole('combobox').click()
    await page.getByRole('option', { name: /Synthetic Athlete/ }).click()
    await expect(page.getByText('Trainer must finish Stripe setup before a paid booking can be reserved.', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Book & Pay', exact: true })).toBeDisabled()
    await expect(page.getByText('Payment collected at Stripe checkout', { exact: true })).toHaveCount(0)

    const date = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)
    const booking = await page.request.post('/api/bookings', { data: { requestId: randomUUID(), serviceOfferingId: service.id,
      athleteProfileId: athlete.id, timeZone: 'UTC', date, startTime: '09:00', expectedTotalInCents: 5000 } })
    expect(booking.status()).toBe(409)
    expect((await booking.json()).error).toContain('Stripe setup')
    expect(await db.booking.count({ where: { parentProfileId: parentProfile.id } })).toBe(0)
    expect(await db.payment.count({ where: { booking: { parentProfileId: parentProfile.id } } })).toBe(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  } finally {
    await db.packagePurchase.deleteMany({ where: { trainerProfile: { userId: trainer.id } } })
    await db.booking.deleteMany({ where: { trainerProfile: { userId: trainer.id } } })
    await db.package.deleteMany({ where: { trainerProfile: { userId: trainer.id } } })
    await db.user.deleteMany({ where: { id: { in: [parent.id, trainer.id] } } })
    if (sportId) await db.sport.delete({ where: { id: sportId } })
  }
})
