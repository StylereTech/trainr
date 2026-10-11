import { expect, test } from '@playwright/test'

test.skip(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(process.env.BASE_URL || ''), 'Loopback UI fixtures only.')
test.use({ channel: process.env.LOCAL_E2E_CHANNEL || 'chrome' })

for (const width of [320, 390, 1024, 1440]) test.describe(`booking layout ${width}px`, () => {
  test.use({ viewport: { width, height: 900 }, timezoneId: 'UTC' })
  for (const empty of [false, true]) test(empty ? 'empty services cannot suggest a bookable session' : 'compact form exposes review and named selection states without a mobile gate', async ({ page }, testInfo) => {
    const title = 'Individual training with a detailed development plan and extended session preparation'
    const trainer = { id: 'layout-trainer', slug: 'layout-trainer', firstName: 'Alexandria', lastName: 'Trainer', headline: null,
      avgRating: 0, totalReviews: 0, city: 'San Francisco', state: 'CA', locationType: 'IN_PERSON', timeZone: 'UTC',
      sports: [{ sport: { name: 'Soccer', icon: null } }],
      serviceOfferings: empty ? [] : [
        { id: 'first', title, description: null, durationMinutes: 60, priceInCents: 99999999, type: 'INDIVIDUAL' },
        { id: 'second', title: 'Skills review', description: null, durationMinutes: 30, priceInCents: 3000, type: 'INDIVIDUAL' },
      ],
      availabilitySlots: Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, specificDate: null, startTime: '09:00', endTime: '12:00', isRecurring: true, isAvailable: true })),
    }
    let writes = 0
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/api/**', route => {
      const path = new URL(route.request().url()).pathname
      if (path === '/api/auth/session') return route.fulfill({ json: { user: { id: 'layout-parent', role: 'PARENT', email: 'layout@example.test' }, expires: '2099-01-01' } })
      if (path === '/api/trainers/layout-trainer') return route.fulfill({ json: trainer })
      if (path === '/api/athletes') return route.fulfill({ json: { athletes: [{ id: 'athlete', firstName: 'Alexandria', lastName: 'Synthetic-Athlete', sports: trainer.sports }] } })
      if (path === '/api/bookings/quote') {
        const selected = trainer.serviceOfferings.find(service => service.id === route.request().postDataJSON().serviceOfferingId)!
        return route.fulfill({ json: { serviceOfferingId: selected.id, couponCode: '', currency: 'usd', subtotalInCents: selected.priceInCents, discountInCents: 0, totalAmountInCents: selected.priceInCents } })
      }
      if (route.request().method() !== 'GET') writes++
      return route.fulfill({ json: {} })
    })
    await page.goto('/book/layout-trainer')
    await expect(page.getByRole('heading', { name: 'Book a session with Alexandria T.' })).toBeVisible()
    if (empty) {
      await expect(page.getByText('No sessions available to book.', { exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Book & Pay', exact: true })).toHaveCount(0)
      await expect(page.getByRole('link', { name: 'Browse Trainers', exact: true })).toHaveAttribute('href', '/browse')
    } else {
      await expect(page.getByText('Media placeholder', { exact: true })).toHaveCount(0)
      await expect(page.getByText('Premium booking flow', { exact: true })).toHaveCount(0)
      const service = page.getByRole('button', { name: new RegExp(title) })
      expect((await service.boundingBox())!.y).toBeLessThan(650)
      const submit = page.getByRole('button', { name: 'Book & Pay', exact: true })
      await expect(submit).toBeVisible()
      await expect(submit).toBeDisabled()
      await expect(page.getByRole('button', { name: /Booking summary/ })).toHaveCount(0)
      await service.focus()
      await page.keyboard.press('Enter')
      await expect(service).toHaveAttribute('aria-pressed', 'true')
      await expect(page.getByRole('button', { name: /Skills review/ })).toHaveAttribute('aria-pressed', 'false')
      await page.getByRole('combobox', { name: 'Athlete', exact: true }).click()
      await page.getByRole('option', { name: /Alexandria Synthetic-Athlete/ }).click()
      const date = new Date()
      date.setUTCDate(date.getUTCDate() + 2)
      const dateButton = page.getByRole('button', { name: `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getUTCDay()]} ${date.getUTCDate()}`, exact: true })
      await dateButton.click()
      await expect(dateButton).toHaveAttribute('aria-pressed', 'true')
      const time = page.getByRole('button', { name: '09:00', exact: true })
      await time.click()
      await expect(time).toHaveAttribute('aria-pressed', 'true')
      await expect(submit).toBeEnabled()
      await expect(page.getByTestId('booking-total')).toHaveText('$999,999.99')
      expect((await page.locator('main').boundingBox())!.height).toBeLessThan(3000)
      await expect(page.getByText('Trainer is notified instantly and confirms the details.', { exact: true })).toHaveCount(0)
    }
    expect(writes).toBe(0)
    expect(errors).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(empty ? 'booking-empty.png' : 'booking-compact.png'), fullPage: true })
  })
})

for (const width of [320, 390]) test.describe(`booking name boundary ${width}px`, () => {
  test.use({ viewport: { width, height: 900 } })
  test('keeps a maximum-length unbroken trainer name inside the page', async ({ page }, testInfo) => {
    const name = 'W'.repeat(50)
    await page.route('**/api/**', route => {
      const path = new URL(route.request().url()).pathname
      if (path === '/api/auth/session') return route.fulfill({ json: {} })
      if (path === '/api/trainers/name-boundary') return route.fulfill({ json: {
        id: 'name-boundary', slug: 'name-boundary', firstName: name, lastName: 'Trainer', headline: null,
        avgRating: 0, totalReviews: 0, city: name, state: 'CA', locationType: 'IN_PERSON', timeZone: 'UTC',
        sports: [], serviceOfferings: [], availabilitySlots: [],
      } })
      return route.fulfill({ json: {} })
    })
    await page.goto('/book/name-boundary')
    await expect(page.getByRole('heading', { name: `Book a session with ${name} T.` })).toBeVisible()
    const back = page.getByRole('link', { name: `Back to ${name}'s profile`, exact: true })
    await expect(back).toHaveAttribute('href', '/trainers/name-boundary')
    for (const field of [back, page.getByText(`${name}, CA`, { exact: true })]) expect(await field.evaluate(element => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      let node: Node | null
      while ((node = walker.nextNode())) {
        const range = document.createRange()
        range.selectNodeContents(node)
        if (Array.from(range.getClientRects()).some(rect => rect.left < 16 || rect.right > innerWidth - 16)) return false
      }
      return true
    })).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('booking-name-boundary.png'), fullPage: true })
  })
})
