import { randomUUID } from 'node:crypto'
import type { User } from '@prisma/client'
import { test as base, expect } from './fixtures/local-auth'

const test = base.extend<{ catalog: { user: User; serviceId: string } }>({
  catalog: async ({ localAuth }, use) => {
    const user = await localAuth.create('TRAINER'), key = randomUUID()
    const sport = await localAuth.database.sport.create({ data: { name: `Synthetic ${key}`, slug: key } })
    try {
      const trainer = await localAuth.database.trainerProfile.update({ where: { userId: user.id }, data: {
        approvalStatus: 'APPROVED', isActive: true,
        sports: { create: { sportId: sport.id } }, serviceOfferings: { create: { title: 'Fundamentals', sportId: sport.id, priceInCents: 6000, durationMinutes: 60 } },
      }, include: { serviceOfferings: true } })
      await localAuth.signIn(user)
      await use({ user, serviceId: trainer.serviceOfferings[0].id })
    } finally {
      await localAuth.database.user.deleteMany({ where: { id: user.id } })
      await localAuth.database.sport.delete({ where: { id: sport.id } })
    }
  },
})
test.use({ channel: process.env.LOCAL_E2E_CHANNEL || 'chrome' })

for (const width of [1440, 390]) {
  test(`real package lifecycle and refresh ${width}px`, async ({ page, localAuth, catalog }, testInfo) => {
    test.setTimeout(90000)
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/trainer/dashboard')
    await page.getByRole('link', { name: 'Packages', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Programs & Packages', exact: true })).toBeVisible()
    await expect(page.getByText('No packages yet.', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'New package', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Title', { exact: true }).fill('Five-session plan')
    await dialog.getByLabel('Price (USD)', { exact: true }).fill('250.00')
    await dialog.getByLabel('Count', { exact: true }).fill('5')
    await dialog.screenshot({ path: testInfo.outputPath('package-editor.png') })
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    await dialog.getByRole('button', { name: 'Save package', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    const row = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'Five-session plan', exact: true }) })
    await expect(row).toContainText('$250.00')
    await expect(row).toContainText('5 sessions')
    const first = await localAuth.database.package.findFirstOrThrow({ where: { trainerProfile: { userId: catalog.user.id } } })
    expect(first.isActive).toBe(false)
    await row.getByRole('button', { name: 'Edit Five-session plan', exact: true }).click()
    await dialog.getByLabel('Price (USD)', { exact: true }).fill('220.50')
    await dialog.getByLabel('Count', { exact: true }).fill('4')
    await dialog.getByRole('button', { name: 'Save package', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(row).toContainText('$220.50')
    await expect(row).toContainText('4 sessions')
    await row.getByRole('switch', { name: 'Active listing for Five-session plan', exact: true }).click()
    await expect(row.getByRole('switch')).toBeChecked()
    const trainer = await localAuth.database.trainerProfile.findUniqueOrThrow({ where: { userId: catalog.user.id } })
    const publicProfile = await page.request.get(`/api/trainers/${trainer.slug}`)
    expect(publicProfile.status()).toBe(200)
    expect((await publicProfile.json()).packages).toHaveLength(1)
    await page.goto(`/trainers/${trainer.slug}`)
    await page.getByRole('tab', { name: 'Services', exact: true }).click()
    await expect(page.getByText('Package checkout unavailable', { exact: true })).toBeVisible()
    await expect(page.getByText('Five-session plan', { exact: true })).toBeVisible()
    await page.goto('/trainer/packages')
    await expect(row.getByRole('button', { name: 'Duplicate Five-session plan', exact: true })).toBeEnabled()
    await row.getByRole('button', { name: 'Duplicate Five-session plan', exact: true }).click()
    await dialog.getByLabel('Title', { exact: true }).fill('Second plan')
    await dialog.getByRole('button', { name: 'Save package', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Second plan', exact: true })).toBeVisible()
    await expect(row.getByRole('switch')).toBeEnabled()
    await row.getByRole('switch').click()
    await expect(row.getByRole('switch')).not.toBeChecked()
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Second plan', exact: true })).toBeVisible()
    await expect(row).toContainText('$220.50')
    const records = await localAuth.database.package.findMany({ where: { trainerProfile: { userId: catalog.user.id } }, include: { items: true } })
    expect(records).toHaveLength(2)
    expect(records.find(value => value.id === first.id)).toMatchObject({ priceInCents: 22050, totalSessions: 4, isActive: false })
    expect(records.every(value => value.items.length === 1 && value.items[0].serviceOfferingId === catalog.serviceId)).toBe(true)
    expect((await (await page.request.get(`/api/trainers/${trainer.slug}`)).json()).packages).toHaveLength(0)
    expect(await localAuth.database.payment.count()).toBe(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('package-list.png'), fullPage: true })
  })

  for (const scenario of ['lost-response', 'malformed', 'conflict'] as const) {
    test(`package ${scenario} requires persisted-state reload ${width}px`, async ({ page, localAuth, catalog }) => {
      test.setTimeout(60000)
      await page.setViewportSize({ width, height: 1000 })
      let savedId = ''
      if (scenario === 'conflict') {
        const response = await page.request.put('/api/trainer/packages', { data: { action: 'save', id: randomUUID(), revision: null, title: 'Existing plan', description: '',
          priceInCents: 25000, validForDays: 90, items: [{ serviceOfferingId: catalog.serviceId, sessionsCount: 5 }] } })
        expect(response.status()).toBe(200)
        savedId = (await response.json()).package.id
      }
      await page.goto('/trainer/packages')
      if (scenario === 'conflict') await page.getByRole('button', { name: 'Edit Existing plan', exact: true }).click()
      else await page.getByRole('button', { name: 'New package', exact: true }).click()
      const dialog = page.getByRole('dialog')
      await dialog.getByLabel('Title', { exact: true }).fill('Reviewed plan')
      await dialog.getByLabel('Price (USD)', { exact: true }).fill('250.00')
      await page.route('**/api/trainer/packages', async route => {
        if (scenario === 'malformed') return route.fulfill({ status: 200, json: { package: { unexpected: 'not saved' } } })
        if (scenario === 'conflict') {
          const current = await localAuth.database.package.findUniqueOrThrow({ where: { id: savedId } })
          await localAuth.database.package.update({ where: { id: savedId }, data: { title: 'Changed elsewhere', updatedAt: new Date(current.updatedAt.getTime() + 1000) } })
          return route.continue()
        }
        const response = await route.fetch()
        expect(response.status()).toBe(200)
        savedId = (await response.json()).package.id
        return route.abort()
      })
      await dialog.getByRole('button', { name: 'Save package', exact: true }).click()
      await expect(dialog.getByRole('alert')).toContainText(scenario === 'conflict' ? 'Package changed' : 'Save result is unknown')
      await expect(dialog.getByRole('button', { name: 'Save package', exact: true })).toBeDisabled()
      await page.unroute('**/api/trainer/packages')
      await dialog.getByRole('button', { name: 'Reload packages', exact: true }).click()
      await expect(dialog).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'New package', exact: true })).toBeEnabled()
      if (scenario === 'malformed') await expect(page.getByText('No packages yet.', { exact: true })).toBeVisible()
      else await expect(page.getByRole('heading', { name: scenario === 'conflict' ? 'Changed elsewhere' : 'Reviewed plan', exact: true })).toBeVisible()
      const records = await localAuth.database.package.findMany({ where: { trainerProfile: { userId: catalog.user.id } } })
      expect(records).toHaveLength(scenario === 'malformed' ? 0 : 1)
      if (savedId) expect(records[0].id).toBe(savedId)
    })
  }

  test(`package list failure and parent denial ${width}px`, async ({ page, localAuth, catalog }) => {
    test.setTimeout(60000)
    await page.setViewportSize({ width, height: 1000 })
    await page.route('**/api/trainer/packages?*', route => route.fulfill({ status: 503, json: { error: 'synthetic outage' } }))
    await page.goto('/trainer/packages')
    await expect(page.getByRole('alert').filter({ hasText: 'Unable to load packages' })).toContainText('Unable to load packages')
    await expect(page.getByRole('button', { name: 'New package', exact: true })).toBeDisabled()
    await page.unroute('**/api/trainer/packages?*')
    await page.getByRole('button', { name: 'Reload packages', exact: true }).click()
    await expect(page.getByText('No packages yet.', { exact: true })).toBeVisible()
    await localAuth.signIn(await localAuth.create('PARENT'))
    expect((await page.request.get('/api/trainer/packages')).status()).toBe(403)
    expect((await page.request.put('/api/trainer/packages', { data: {} })).status()).toBe(403)
    await page.goto('/trainer/packages')
    await expect(page).toHaveURL(/\/parent\/dashboard$/)
    expect(await localAuth.database.package.count({ where: { trainerProfile: { userId: catalog.user.id } } })).toBe(0)
  })
  test(`package creation requires a saved active service ${width}px`, async ({ page, localAuth }) => {
    await page.setViewportSize({ width, height: 1000 })
    await localAuth.signIn(await localAuth.create('TRAINER'))
    await page.goto('/trainer/packages')
    await expect(page.getByText('No active services.', { exact: false })).toBeVisible()
    await expect(page.getByRole('button', { name: 'New package', exact: true })).toBeDisabled()
    await expect(page.getByRole('link', { name: 'Manage services', exact: true })).toHaveAttribute('href', '/trainer/profile?tab=services')
  })
}
