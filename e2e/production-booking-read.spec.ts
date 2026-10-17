import { expect, test } from '@playwright/test'
import { loginAs } from './helpers'

test.skip(process.env.TRAINR_PUBLIC_DEMO_STATUS !== '1', 'Requires approved public demo account access')

for (const role of ['parent', 'trainer'] as const) {
  test(`${role} can read bookings on the public deployment`, async ({ page }) => {
    await loginAs(page, role)
    const response = await page.request.get('/api/bookings?page=1&limit=10')
    expect(response.status()).toBe(200)
    const data = await response.json()
    expect(Array.isArray(data.bookings)).toBe(true)
    expect(data.pagination).toEqual(expect.objectContaining({ page: 1, limit: 10, total: expect.any(Number) }))
  })
}
