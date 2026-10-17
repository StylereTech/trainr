import { createHash, randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { expect, test } from './fixtures/local-auth'
import { approvedPackageCreditPolicy, packagePurchaseRequestSchema } from '../src/lib/package-purchase-schema'
import { packageStorageKey } from '../src/lib/package-checkout-client'

test.skip(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(process.env.BASE_URL || '') || !process.env.LOCAL_E2E_SECRET, 'Requires disposable loopback fixtures.')
test.use({ channel: process.env.LOCAL_E2E_CHANNEL || 'chrome' })

for (const role of ['ANONYMOUS', 'TRAINER'] as const) test(`purchase review pages protect ${role}`, async ({ page, localAuth }) => {
  if (role === 'TRAINER') await localAuth.signIn(await localAuth.create('TRAINER'))
  for (const path of ['/parent/packages/buy/audit-probe', '/parent/packages/audit-probe/checkout']) {
    const response = await page.request.get(path, { maxRedirects: 0 })
    expect(response.status()).toBe(307)
    const destination = new URL(response.headers().location, process.env.BASE_URL)
    expect(destination.origin).toBe(process.env.BASE_URL)
    expect(destination.pathname).toBe(role === 'ANONYMOUS' ? '/auth/signin' : '/dashboard')
  }
  expect((await page.request.get('/api/package-purchases/review?packageId=audit-probe')).status()).toBe(role === 'ANONYMOUS' ? 401 : 403)
})

for (const width of [1440, 390]) test.describe(`package purchase ${width}px`, () => {
  test.use({ viewport: { width, height: 1000 } })
  for (const scenario of ['normal', 'lost-before', 'lost-after', 'malformed', 'unsafe-url', 'provider-failure', 'changed-offer',
    'storage-write', 'storage-read', 'corrupt-storage', 'held', 'read-failure', 'wrong-identity', 'paid-repeat', 'long-title'] as const) test(scenario, async ({ page, localAuth }, info) => {
    const db = localAuth.database, parent = await localAuth.create('PARENT'), trainer = await localAuth.create('TRAINER')
    const parentProfile = await db.parentProfile.findUniqueOrThrow({ where: { userId: parent.id } })
    const key = randomUUID().replaceAll('-', ''), sport = await db.sport.create({ data: { name: `Purchase ${key}`, slug: key } })
    const trainerProfile = await db.trainerProfile.update({ where: { userId: trainer.id }, data: { isActive: true, approvalStatus: 'APPROVED',
      timeZone: 'UTC', stripeAccountId: `acct_synthetic_${key}`, sports: { create: { sportId: sport.id } } } })
    const errors: string[] = [], bodies: any[] = []
    const alert = page.getByRole('alert').filter({ has: page.getByRole('link', { name: 'Review purchase history', exact: true }) })
    page.on('pageerror', error => errors.push(error.message))
    try {
      const service = await db.serviceOffering.create({ data: { trainerProfileId: trainerProfile.id, sportId: sport.id,
        title: 'Basketball fundamentals and individual skill development', durationMinutes: 60, priceInCents: 3000 } })
      const title = scenario === 'long-title' ? 'BasketballDevelopment'.repeat(8).slice(0, 150) : 'Family basketball program - '.repeat(5).slice(0, 150).trim()
      const catalog = await db.package.create({ data: { trainerProfileId: trainerProfile.id, title, description: 'Two individual sessions covering ball control, passing, footwork and shooting. Each session can be booked for a different child.',
        totalSessions: 2, validForDays: 90, priceInCents: 6000, items: { create: { serviceOfferingId: service.id, sessionsCount: 2 } } } })
      const storageKey = packageStorageKey(parent.id, catalog.id), buyPath = `/parent/packages/buy/${catalog.id}`
      const terms = () => ({ version: 2, creditPolicy: approvedPackageCreditPolicy, title, description: catalog.description || '', totalSessions: 2, validForDays: 90,
        items: [{ serviceOfferingId: service.id, title: service.title, sportId: sport.id, durationMinutes: 60, type: 'INDIVIDUAL', sessionsCount: 2 }] })
      // Browser contract fixtures only. SQL tests exercise the real purchase route/provider lifecycle.
      const save = async (body: any) => {
        if (body.purchaseId) return db.packagePurchase.findUniqueOrThrow({ where: { id: body.purchaseId } })
        const { requestId, ...input } = packagePurchaseRequestSchema.parse(body)
        expect(input.packageId).toBe(catalog.id)
        const previous = await db.packagePurchase.findUnique({ where: { parentProfileId_requestId: { parentProfileId: parentProfile.id, requestId } } })
        if (previous) return previous
        return db.packagePurchase.create({ data: { parentProfileId: parentProfile.id, trainerProfileId: trainerProfile.id, packageId: catalog.id, requestId,
          payloadHash: createHash('sha256').update(JSON.stringify(input)).digest('hex'), catalogRevision: new Date(input.catalogRevision), terms: terms(),
          amountInCents: input.expectedTotalInCents, platformFeeInCents: Math.round(input.expectedTotalInCents * 0.15), trainerPayoutInCents: input.expectedTotalInCents - Math.round(input.expectedTotalInCents * 0.15) } })
      }
      let id: string | undefined
      await page.route('https://checkout.stripe.com/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Synthetic checkout response</h1>' }))
      await page.route('**/api/package-purchases/refresh', route => route.fulfill({ status: 503, json: { error: 'Synthetic provider refresh unavailable' } }))
      await page.route('**/api/package-purchases/checkout', async route => {
        const body = route.request().postDataJSON(); bodies.push(body)
        if (scenario === 'lost-before' && bodies.length === 1) return route.abort('failed')
        if (scenario === 'changed-offer' && bodies.length === 1) {
          await db.package.update({ where: { id: catalog.id }, data: { priceInCents: 7000 } })
          return route.fulfill({ status: 409, json: { error: 'Package terms changed. Review the latest package before purchasing.', code: 'OFFER_CHANGED' } })
        }
        const saved = await save(body); id = saved.id
        if (bodies.length === 1) {
          if (scenario === 'lost-after') return route.abort('failed')
          if (scenario === 'malformed') return route.fulfill({ status: 200, contentType: 'application/json', body: '{' })
          if (scenario === 'unsafe-url') return route.fulfill({ status: 200, json: { purchaseId: id, checkoutUrl: 'https://untrusted.example/pay' } })
          if (scenario === 'provider-failure') return route.fulfill({ status: 503, json: { error: 'Synthetic provider unavailable. Retry the saved request.' } })
        }
        return route.fulfill({ json: { purchaseId: id, checkoutUrl: 'https://checkout.stripe.com/c/pay/synthetic-package' } })
      })
      if (scenario === 'read-failure' || scenario === 'wrong-identity') {
        let reads = 0
        await page.route('**/api/package-purchases/review?**', async route => {
          reads++
          if (scenario === 'read-failure' && reads === 1) return route.fulfill({ status: 503, json: { error: 'Synthetic read outage' } })
          if (scenario === 'wrong-identity') { const response = await route.fetch(); return route.fulfill({ json: { ...await response.json(), buyerId: 'another-parent' } }) }
          return route.continue()
        })
      }
      if (scenario === 'storage-write') await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new Error('Synthetic storage failure') } })
      if (scenario === 'storage-read') await page.addInitScript(() => { Object.defineProperty(window, 'sessionStorage', { get() { throw new Error('Synthetic storage denied') } }) })
      if (scenario === 'corrupt-storage') await page.addInitScript(key => { sessionStorage.setItem(key, '{') }, storageKey)
      await localAuth.signIn(parent)
      if (scenario === 'held') {
        const saved = await save({ requestId: randomUUID(), packageId: catalog.id, catalogRevision: catalog.updatedAt.toISOString(), expectedTotalInCents: 6000 }); id = saved.id
        await db.packagePurchase.update({ where: { id }, data: { financialReview: Prisma.JsonNull } })
        await page.goto(`/parent/packages/${id}/checkout`)
        await expect(page.getByText('Package purchase already has financial activity. Review it before paying again.', { exact: true })).toBeVisible()
        await expect(page.getByRole('button', { name: /Continue saved checkout|Pay in full with Stripe/ })).toHaveCount(0)
        await page.goto('/parent/packages')
        await page.getByLabel('Payment status', { exact: true }).selectOption('review')
        await expect(page.getByText('Financial review required', { exact: true })).toBeVisible()
        await page.getByRole('link', { name: 'Review payment', exact: true }).click()
        await expect(page.getByRole('heading', { name: 'Review package purchase', exact: true })).toBeVisible()
        expect(bodies).toHaveLength(0)
      } else {
        if (scenario === 'normal' || scenario === 'long-title') {
          await page.goto(`/trainers/${trainerProfile.slug}`)
          await page.getByRole('tab', { name: 'Services', exact: true }).click()
          if (scenario === 'long-title') {
            await page.screenshot({ path: info.outputPath('long-title-profile.png'), fullPage: true })
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
            expect(await page.getByRole('heading', { name: title, exact: true }).evaluate(element =>
              element.scrollWidth <= element.clientWidth && element.getBoundingClientRect().right <= innerWidth)).toBe(true)
          }
          await page.getByRole('link', { name: 'Review package', exact: true }).click()
        } else await page.goto(buyPath)
        if (scenario === 'read-failure') {
          await expect(alert).toBeVisible()
          await page.getByRole('button', { name: 'Reload package details', exact: true }).click()
        }
        if (scenario === 'wrong-identity') {
          await expect(page.getByText('Purchase details did not match this account or package. Reload before paying.', { exact: true })).toBeVisible()
          await expect(page.getByRole('button', { name: 'Pay in full with Stripe', exact: true })).toHaveCount(0)
          expect(bodies).toHaveLength(0)
        } else {
          await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
          if (scenario === 'storage-read' || scenario === 'corrupt-storage') {
            await expect(alert).toBeVisible()
            await expect(page.getByRole('button', { name: 'Pay in full with Stripe', exact: true })).toBeDisabled()
            expect(bodies).toHaveLength(0)
          } else {
            await expect(page.getByRole('button', { name: 'Pay in full with Stripe', exact: true })).toBeDisabled()
            await page.getByRole('checkbox').check()
            if (scenario === 'normal') {
              await page.screenshot({ path: info.outputPath('package-review.png'), fullPage: true })
              expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
              await expect(page.getByRole('button', { name: 'Reload package details', exact: true })).toHaveCSS('width', '40px')
            }
            await page.getByRole('button', { name: 'Pay in full with Stripe', exact: true }).click()
            if (scenario === 'storage-write') {
              await expect(page.getByText('Checkout recovery could not be saved. No payment request was sent.', { exact: true })).toBeVisible()
              expect(bodies).toHaveLength(0)
            } else {
              if (['lost-before', 'lost-after', 'malformed', 'unsafe-url', 'provider-failure'].includes(scenario)) {
                await expect(alert).toBeVisible()
                expect(bodies).toHaveLength(1)
                await page.reload()
                await expect(page.getByRole('button', { name: 'Continue saved checkout', exact: true })).toBeVisible()
                await page.getByRole('checkbox').check()
                await page.getByRole('button', { name: 'Continue saved checkout', exact: true }).click()
                await expect.poll(() => bodies.length).toBe(2)
                expect(bodies[1]).toEqual(scenario === 'lost-before' ? bodies[0] : { purchaseId: id })
              }
              if (scenario === 'changed-offer') {
                await expect(page.getByText('$70.00', { exact: true })).toBeVisible()
                await expect(page.getByRole('checkbox')).not.toBeChecked()
                await page.getByRole('checkbox').check()
                await page.getByRole('button', { name: 'Pay in full with Stripe', exact: true }).click()
                await expect.poll(() => bodies.length).toBe(2)
                expect(bodies[1].requestId).not.toBe(bodies[0].requestId); expect(bodies[1].expectedTotalInCents).toBe(7000)
              }
              await expect(page).toHaveURL('https://checkout.stripe.com/c/pay/synthetic-package')
              expect(await db.packagePurchase.count({ where: { trainerProfileId: trainerProfile.id } })).toBe(1)
              await page.goto(`/parent/packages/${id}/checkout?payment=returned`)
              await expect(page.getByText('Payment not recorded', { exact: true })).toBeVisible()
              await expect(page.getByText('Payment recorded', { exact: true })).toHaveCount(0)
              if (scenario === 'paid-repeat') {
                await db.packagePurchase.update({ where: { id }, data: { status: 'SUCCEEDED', stripeCheckoutSessionId: `cs_synthetic_${key}`,
                  stripePaymentIntentId: `pi_synthetic_${key}`, stripeChargeId: `ch_synthetic_${key}`, stripeTransferId: `tr_synthetic_${key}`, settlementVerifiedAt: new Date() } })
                await db.packagePaymentReceipt.create({ data: { purchaseId: id!, stripeEventId: `evt_synthetic_${key}`, stripePaymentIntentId: `pi_synthetic_${key}`,
                  stripeChargeId: `ch_synthetic_${key}`, stripeCheckoutSessionId: `cs_synthetic_${key}`, livemode: false, paidAt: new Date(Math.floor(Date.now() / 1000) * 1000) } })
                await page.reload()
                await expect(page.getByText('Payment recorded', { exact: true })).toBeVisible()
                await expect(page.getByRole('button', { name: 'Continue saved checkout', exact: true })).toHaveCount(0)
                await page.getByRole('button', { name: 'Review another purchase', exact: true }).click()
                await expect(page.getByRole('button', { name: 'Pay in full with Stripe', exact: true })).toBeDisabled()
                expect(bodies).toHaveLength(1)
              }
            }
          }
        }
      }
      expect(errors).toEqual([])
      expect(await db.booking.count()).toBe(0); expect(await db.payment.count()).toBe(0); expect(await db.walletEntry.count()).toBe(0)
    } finally {
      await db.packagePurchase.deleteMany({ where: { trainerProfileId: trainerProfile.id } })
      await db.user.delete({ where: { id: trainer.id } }); await db.sport.delete({ where: { id: sport.id } })
    }
  })
})
