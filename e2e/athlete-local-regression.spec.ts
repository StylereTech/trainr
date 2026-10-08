import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures/local-auth'

test.skip(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(process.env.BASE_URL || '') || !process.env.LOCAL_E2E_SECRET, 'Requires a guarded disposable local database and server.')
test.use({ channel: process.env.LOCAL_E2E_CHANNEL || undefined })

async function fill(page: Page, sport: string) {
  await page.getByLabel('First name', { exact: true }).fill('Synthetic')
  await page.getByLabel('Last name', { exact: true }).fill('Athlete')
  await page.getByLabel('Date of birth', { exact: true }).fill('2016-02-29')
  await page.getByRole('checkbox', { name: sport, exact: true }).check()
  await page.getByLabel('Goals', { exact: true }).fill('Confidence\nTeamwork')
  await page.getByLabel('Parent notes', { exact: true }).fill('Synthetic private note')
}

for (const width of [1440, 390]) {
  test.describe(`athlete profiles ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } })
    test('retries a committed save with the same key, refreshes, edits and deletes real data', async ({ page, localAuth }, testInfo) => {
      const parent = await localAuth.create('PARENT')
      await localAuth.signIn(parent)
      const sport = await localAuth.database.sport.create({ data: { slug: randomUUID(), name: 'Synthetic Tennis' } })
      const bodies: string[] = []
      try {
        await page.route('**/api/athletes', async route => {
          if (route.request().method() !== 'POST') return route.continue()
          bodies.push(route.request().postData()!)
          const response = await route.fetch()
          expect(response.status()).toBe(bodies.length === 1 ? 201 : 200)
          if (bodies.length === 1) return route.abort('failed')
          return route.fulfill({ response })
        })
        await page.goto('/parent/athletes/new')
        await fill(page, sport.name)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        await page.screenshot({ path: testInfo.outputPath('athlete-create.png'), fullPage: true })
        await page.getByRole('button', { name: 'Save athlete profile', exact: true }).click()
        await expect(page.getByRole('button', { name: 'Retry same save', exact: true })).toBeVisible()
        await expect(page.getByLabel('First name', { exact: true })).toBeDisabled()
        await expect.poll(() => localAuth.database.athleteProfile.count({ where: { parentProfile: { userId: parent.id } } })).toBe(1)
        await page.getByRole('button', { name: 'Retry same save', exact: true }).click()
        await expect(page).toHaveURL(/\/parent\/dashboard$/)
        expect(bodies).toHaveLength(2)
        expect(bodies[0]).toBe(bodies[1])
        await page.reload()
        await page.getByRole('link', { name: 'Synthetic Athlete', exact: true }).click()
        await expect(page.getByLabel('Date of birth', { exact: true })).toHaveValue('2016-02-29')
        await expect(page.getByLabel('Goals', { exact: true })).toHaveValue('Confidence\nTeamwork')
        await expect(page.getByLabel('Parent notes', { exact: true })).toHaveValue('Synthetic private note')
        await page.getByLabel('First name', { exact: true }).fill('Revised')
        await page.getByRole('button', { name: 'Save athlete profile', exact: true }).click()
        await expect(page).toHaveURL(/\/parent\/dashboard$/)
        await page.reload()
        await page.getByRole('link', { name: 'Revised Athlete', exact: true }).click()
        await expect(page.getByLabel('First name', { exact: true })).toHaveValue('Revised')
        await expect(page.getByRole('button', { name: 'Delete athlete', exact: true })).toBeDisabled()
        await page.getByRole('checkbox', { name: 'Delete this athlete profile', exact: true }).check()
        await page.screenshot({ path: testInfo.outputPath('athlete-edit.png'), fullPage: true })
        await page.getByRole('button', { name: 'Delete athlete', exact: true }).click()
        await expect(page).toHaveURL(/\/parent\/dashboard$/)
        expect(await localAuth.database.athleteProfile.count({ where: { parentProfile: { userId: parent.id } } })).toBe(0)
        const ledger = await localAuth.database.athleteCreateRequest.findMany({ where: { parentProfile: { userId: parent.id } } })
        expect(ledger).toHaveLength(1)
        expect(ledger[0].athleteProfileId).toBeNull()
      } finally {
        await localAuth.database.athleteProfile.deleteMany({ where: { parentProfile: { userId: parent.id } } })
        await localAuth.database.sport.delete({ where: { id: sport.id } })
      }
    })

    test('requires a reload after a stale edit and keeps the current database value', async ({ page, localAuth }) => {
      const parent = await localAuth.create('PARENT')
      await localAuth.signIn(parent)
      const sport = await localAuth.database.sport.create({ data: { slug: randomUUID(), name: 'Synthetic Tennis' } })
      try {
        await page.goto('/parent/athletes/new')
        await fill(page, sport.name)
        await page.getByRole('button', { name: 'Save athlete profile', exact: true }).click()
        await expect(page).toHaveURL(/\/parent\/dashboard$/)
        await page.getByRole('link', { name: 'Synthetic Athlete', exact: true }).click()
        await expect(page.getByLabel('First name', { exact: true })).toHaveValue('Synthetic')
        const athlete = await localAuth.database.athleteProfile.findFirstOrThrow({ where: { parentProfile: { userId: parent.id } } })
        await localAuth.database.athleteProfile.update({ where: { id: athlete.id }, data: { firstName: 'External', updatedAt: new Date(athlete.updatedAt.getTime() + 1000) } })
        await page.getByLabel('First name', { exact: true }).fill('Stale')
        await page.getByRole('button', { name: 'Save athlete profile', exact: true }).click()
        await expect(page.getByText('This athlete changed. Reload before saving or deleting.', { exact: true })).toBeVisible()
        await expect(page.getByLabel('First name', { exact: true })).toBeDisabled()
        await page.getByRole('button', { name: 'Reload athlete', exact: true }).click()
        await expect(page.getByLabel('First name', { exact: true })).toHaveValue('External')
        await expect(page.getByLabel('First name', { exact: true })).toBeEnabled()
      } finally {
        await localAuth.database.athleteProfile.deleteMany({ where: { parentProfile: { userId: parent.id } } })
        await localAuth.database.sport.delete({ where: { id: sport.id } })
      }
    })

    test('distinguishes failed reads from an empty active catalog', async ({ page, localAuth }, testInfo) => {
      await localAuth.signIn(await localAuth.create('PARENT'))
      let failed = true
      await page.route('**/api/athletes', route => route.fulfill(failed ? { status: 503, json: { error: 'Synthetic read failure' } } : { json: { athletes: [], catalog: [] } }))
      await page.goto('/parent/athletes/new')
      await expect(page.getByRole('alert').filter({ hasText: 'Athlete details are unavailable.' })).toBeVisible()
      await expect(page.getByLabel('First name', { exact: true })).toHaveCount(0)
      failed = false
      await page.getByRole('button', { name: 'Retry athletes', exact: true }).click()
      await expect(page.getByText('No sports are currently available.', { exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Save athlete profile', exact: true })).toBeDisabled()
      await page.screenshot({ path: testInfo.outputPath('athlete-empty.png'), fullPage: true })
    })

    test('recovers an inline read failure and prevents closing an uncertain committed save', async ({ page, localAuth }, testInfo) => {
      const parent = await localAuth.create('PARENT')
      await localAuth.signIn(parent)
      const sport = await localAuth.database.sport.create({ data: { slug: randomUUID(), name: 'Synthetic Tennis' } })
      let failRead = true, saves = 0
      try {
        await page.route('**/api/trainers/local-athlete', route => route.fulfill({ json: {
          id: 'fixture', slug: 'local-athlete', firstName: 'Synthetic', lastName: 'Trainer', headline: 'Training', avgRating: 0, totalReviews: 0,
          city: 'Austin', state: 'TX', locationType: 'IN_PERSON', sports: [{ sport: { name: sport.name, icon: null } }], serviceOfferings: [], availabilitySlots: [],
        } }))
        await page.route('**/api/athletes', async route => {
          if (route.request().method() === 'GET') return failRead ? route.fulfill({ status: 503, json: { error: 'Synthetic read failure' } }) : route.continue()
          saves++
          const response = await route.fetch()
          expect(response.status()).toBe(saves === 1 ? 201 : 200)
          return saves === 1 ? route.abort('failed') : route.fulfill({ response })
        })
        await page.goto('/book/local-athlete')
        await expect(page.getByText('Athletes could not be loaded. Please retry.', { exact: true })).toBeVisible()
        await expect(page.getByRole('button', { name: 'Add your athlete to continue', exact: true })).toHaveCount(0)
        failRead = false
        await page.getByRole('button', { name: 'Retry athletes', exact: true }).click()
        await page.getByRole('button', { name: 'Add your athlete to continue', exact: true }).click()
        await fill(page, sport.name)
        await page.getByRole('button', { name: 'Save athlete profile', exact: true }).click()
        await expect(page.getByRole('button', { name: 'Retry same save', exact: true })).toBeVisible()
        await expect(page.getByRole('button', { name: 'Close athlete form', exact: true })).toBeDisabled()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        await page.screenshot({ path: testInfo.outputPath('inline-athlete-retry.png'), fullPage: true })
        await page.getByRole('button', { name: 'Retry same save', exact: true }).click()
        await expect(page.getByRole('combobox').filter({ hasText: 'Synthetic Athlete' })).toBeVisible()
        expect(saves).toBe(2)
        expect(await localAuth.database.athleteProfile.count({ where: { parentProfile: { userId: parent.id } } })).toBe(1)
      } finally {
        await localAuth.database.athleteProfile.deleteMany({ where: { parentProfile: { userId: parent.id } } })
        await localAuth.database.sport.delete({ where: { id: sport.id } })
      }
    })
  })
}
