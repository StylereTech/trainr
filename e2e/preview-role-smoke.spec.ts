import { expect, test } from '@playwright/test'

const previewUrl = 'https://trainr-git-codex-payment-readiness-20261006-styleres-projects.vercel.app'
const enabled = process.env.TRAINR_PREVIEW_ROLE_SMOKE === '1'
test.use({ channel: process.env.LOCAL_E2E_CHANNEL || (process.platform === 'win32' ? 'chrome' : 'chromium') })

test.describe('isolated Preview role journeys', () => {
  test.skip(!enabled, 'Requires the explicitly provisioned isolated Preview test accounts')
  test.setTimeout(60_000)

  const roles = [
    { role: 'PARENT', destination: '/parent/dashboard', heading: 'Parent dashboard', forbidden: '/trainer/dashboard' },
    { role: 'TRAINER', destination: '/trainer/dashboard', heading: 'Trainer dashboard', forbidden: '/parent/dashboard' },
    { role: 'ADMIN', destination: '/admin', heading: 'Admin overview', forbidden: '/parent/dashboard' },
  ] as const
  const endpoints = [
    { path: '/api/athletes', PARENT: 200, TRAINER: 403, ADMIN: 403 },
    { path: '/api/bookings', PARENT: 200, TRAINER: 200, ADMIN: 200 },
    { path: '/api/package-purchases', PARENT: 200, TRAINER: 200, ADMIN: 403 },
    { path: '/api/trainer/onboarding', PARENT: 403, TRAINER: 200, ADMIN: 403 },
    { path: '/api/trainer/packages', PARENT: 403, TRAINER: 200, ADMIN: 403 },
    { path: '/api/admin?view=overview', PARENT: 401, TRAINER: 401, ADMIN: 200 },
  ] as const

  for (const { role, destination, heading, forbidden } of roles) {
    test(`${role.toLowerCase()} signs in, persists, and cannot open another role's dashboard`, async ({ page }) => {
      expect(process.env.BASE_URL).toBe(previewUrl)
      const email = process.env[`TRAINR_TEST_${role}_EMAIL`]
      const password = process.env[`TRAINR_TEST_${role}_PASSWORD`]
      expect(email, `${role} email must be supplied at runtime`).toBeTruthy()
      expect(password, `${role} password must be supplied at runtime`).toBeTruthy()

      await page.goto('/auth/signin')
      await page.getByLabel('Email').fill(email!)
      await page.getByLabel('Password').fill(password!)
      await page.getByRole('button', { name: 'Sign In' }).click()
      await expect(page).toHaveURL(new RegExp(`${destination}$`))
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()

      await page.reload()
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()

      const session = await page.request.get('/api/auth/session')
      expect(session.status()).toBe(200)
      expect(await session.json()).toMatchObject({ user: { email, role } })
      for (const endpoint of endpoints) {
        const response = await page.request.get(endpoint.path)
        expect(response.status(), `${role} GET ${endpoint.path}`).toBe(endpoint[role])
      }

      await page.goto(forbidden)
      await expect(page).not.toHaveURL(new RegExp(`${forbidden}$`))
      await expect(page).not.toHaveURL(/\/auth\/signin(?:\?|$)/)
    })
  }
})
