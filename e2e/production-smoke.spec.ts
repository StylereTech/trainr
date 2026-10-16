import { expect, test } from '@playwright/test'

// This suite is intentionally anonymous and read-only. Authenticated role and
// money-flow checks require explicitly provisioned accounts and separate proof.
test.use({ channel: process.env.LOCAL_E2E_CHANNEL || (process.platform === 'win32' ? 'chrome' : 'chromium') })

test('public entry points render', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await page.getByRole('link', { name: 'Find Trainers' }).first().click()
  await expect(page).toHaveURL(/\/browse(?:\?|$)/)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})

test('database health and trainer catalog respond', async ({ request }) => {
  const health = await request.get('/api/health')
  expect(health.status()).toBe(200)
  expect(await health.json()).toMatchObject({ ok: true, dbConnected: true })

  const catalog = await request.get('/api/trainers?limit=1&page=1')
  expect(catalog.status()).toBe(200)
  const body = await catalog.json()
  expect(Array.isArray(body.trainers)).toBe(true)
  expect(body.pagination).toMatchObject({ page: 1, limit: 1 })
  expect(Number.isInteger(body.pagination.total)).toBe(true)
})

test('anonymous users cannot reach protected pages or APIs', async ({ page, request }) => {
  for (const path of ['/parent/dashboard', '/trainer/dashboard', '/admin', '/messages']) {
    await page.goto(path)
    await expect(page).toHaveURL(/\/auth\/signin(?:\?|$)/)
  }
  for (const path of ['/api/athletes', '/api/trainer/stripe-connect', '/api/admin?tab=overview']) {
    const response = await request.get(path)
    expect([401, 403], `${path} must reject anonymous access`).toContain(response.status())
  }
})
