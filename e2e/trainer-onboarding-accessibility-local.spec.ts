import { test, expect } from './fixtures/local-auth'

test.use({ channel: process.env.LOCAL_E2E_CHANNEL || 'chrome' })

for (const width of [1440, 390]) {
  test(`trainer onboarding labels and keyboard selections ${width}px`, async ({ page, localAuth }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    await localAuth.signIn(await localAuth.create('TRAINER'))
    await page.route('**/api/trainer/onboarding', route => {
      expect(route.request().method()).toBe('GET')
      return route.fulfill({ json: { minServicePriceInCents: 1500, catalog: [{
        id: 'fixture-basketball', slug: 'basketball', name: 'Basketball', icon: null, isActive: true,
        specialties: [{ id: 'fixture-shooting', slug: 'shooting', name: 'Shooting' }],
      }] } })
    })
    await page.goto('/trainer/onboarding')
    const sport = page.getByRole('button', { name: 'Basketball', exact: true })
    await expect(sport).toHaveAttribute('aria-pressed', 'false')
    await sport.focus()
    await sport.press('Space')
    await expect(sport).toHaveAttribute('aria-pressed', 'true')
    const specialty = page.getByRole('button', { name: 'Shooting (Basketball)', exact: true })
    await expect(specialty).toHaveAttribute('aria-pressed', 'false')
    await specialty.focus()
    await specialty.press('Space')
    await expect(specialty).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    for (const label of ['First Name', 'Last Name', 'Headline', 'Bio', 'Phone', 'Years Experience', 'Location Type', 'City', 'State', 'Zip Code', 'Travel Radius (miles)']) {
      await expect(page.getByLabel(label, { exact: true })).toHaveCount(1)
    }
    await page.getByText('First Name', { exact: true }).click()
    await expect(page.getByLabel('First Name', { exact: true })).toBeFocused()
    await page.getByLabel('First Name', { exact: true }).fill('Synthetic')
    await page.getByLabel('Last Name', { exact: true }).fill('Coach')
    await page.getByLabel('Bio', { exact: true }).fill('Synthetic coaching biography for local interface testing.')
    await page.getByLabel('Certification 1 name', { exact: true }).fill('Example coaching certification')
    await page.getByLabel('Certification 1 organization', { exact: true }).fill('Example organization')
    await page.getByRole('button', { name: 'Add Certification', exact: true }).click()
    await expect(page.getByLabel('Certification 2 name', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Remove certification 2', exact: true }).click()
    await expect(page.getByLabel('Certification 2 name', { exact: true })).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('onboarding-profile.png'), fullPage: true })
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    for (const label of ['Title', 'Description', 'Duration (min)', 'Price ($)', 'Type']) {
      await expect(page.getByLabel(label, { exact: true })).toHaveCount(1)
    }
    await page.getByLabel('Service 1 sport', { exact: true }).click()
    await page.getByRole('option', { name: 'Basketball', exact: true }).click()
    await page.getByLabel('Title', { exact: true }).fill('Synthetic training session')
    await page.getByLabel('Price ($)', { exact: true }).fill('50')
    await page.getByRole('button', { name: 'Add Another Service', exact: true }).click()
    await expect(page.getByLabel('Title', { exact: true })).toHaveCount(2)
    await page.getByRole('button', { name: 'Remove service 2', exact: true }).click()
    await expect(page.getByLabel('Title', { exact: true })).toHaveCount(1)
    await page.getByLabel('Type', { exact: true }).focus()
    await page.getByLabel('Type', { exact: true }).press('Space')
    await expect(page.getByRole('option', { name: 'Virtual', exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('onboarding-services.png'), fullPage: true })
    await page.getByRole('button', { name: 'Back', exact: true }).click()
    await expect(page.getByLabel('First Name', { exact: true })).toHaveValue('Synthetic')
    await expect(page.getByLabel('Certification 1 name', { exact: true })).toHaveValue('Example coaching certification')
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Synthetic training session')
    await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeEnabled()
  })
}
