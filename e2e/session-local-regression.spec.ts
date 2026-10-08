import { randomUUID } from 'node:crypto'
import { encode } from 'next-auth/jwt'
import { test, expect } from './fixtures/local-auth'

test.skip(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(process.env.BASE_URL || '') || !process.env.LOCAL_E2E_SECRET,
  'Session mutation tests require an explicitly configured loopback server and disposable database.')
test.use({ channel: process.env.LOCAL_E2E_CHANNEL || undefined })

for (const width of [1440, 390]) {
  test(`real credential login and password-reset revocation at ${width}px`, async ({ page, localAuth }) => {
    await page.setViewportSize({ width, height: 900 })
    const user = await localAuth.create('PARENT')
    await page.goto('/auth/signin')
    await page.getByLabel('Email', { exact: true }).fill(user.email)
    await page.getByLabel('Password', { exact: true }).fill(localAuth.password)
    await page.locator('form').getByRole('button', { name: 'Sign In', exact: true }).click()
    await expect(page).toHaveURL(/\/parent\/dashboard/)
    expect((await page.request.get('/api/bookings')).status()).toBe(200)
    const session = await (await page.request.get('/api/auth/session')).json()
    expect(session.user).toMatchObject({ id: user.id, role: 'PARENT' })
    expect(session.user).not.toHaveProperty('sessionVersion')
    expect(session.user).not.toHaveProperty('passwordHash')
    const token = randomUUID()
    await localAuth.database.user.update({ where: { id: user.id }, data: { resetPasswordToken: token, resetPasswordExpiry: new Date(Date.now() + 60000) } })
    const newPassword = `New-local-${randomUUID()}`
    expect((await page.request.post('/api/auth/reset-password', { data: { token, password: newPassword } })).status()).toBe(200)
    expect((await page.request.get('/api/bookings')).status()).toBe(401)
    const revokedSession = await (await page.request.get('/api/auth/session')).json()
    expect(revokedSession?.user).toBeUndefined()
    await page.goto('/parent/dashboard')
    await expect(page).toHaveURL(/\/auth\/signin/)
    await page.getByLabel('Email', { exact: true }).fill(user.email)
    await page.getByLabel('Password', { exact: true }).fill(newPassword)
    await page.locator('form').getByRole('button', { name: 'Sign In', exact: true }).click()
    await expect(page).toHaveURL(/\/parent\/dashboard/)
    expect((await page.request.get('/api/bookings')).status()).toBe(200)
  })
}

test('real admin role change revokes old admin API and page access and excludes credentials', async ({ page, localAuth }) => {
  const actor = await localAuth.create('ADMIN')
  const target = await localAuth.create('ADMIN')
  await localAuth.signIn(target)
  expect((await page.request.get('/api/admin/users')).status()).toBe(200)
  await localAuth.signIn(actor)
  const listing = await page.request.get('/api/admin?view=users')
  expect(listing.status()).toBe(200)
  const body = await listing.json()
  const rows = Array.isArray(body) ? body : body.users
  expect(rows.length).toBeGreaterThanOrEqual(2)
  for (const row of rows) {
    for (const field of ['passwordHash', 'sessionVersion', 'resetPasswordToken', 'verificationToken']) expect(row).not.toHaveProperty(field)
  }
  expect((await page.request.patch('/api/admin/users', { data: { userId: target.id, action: 'change_role', role: 'PARENT' } })).status()).toBe(200)
  expect((await localAuth.database.user.findUniqueOrThrow({ where: { id: target.id } })).sessionVersion).toBe(1)
  await localAuth.signIn(target)
  expect((await page.request.get('/api/admin/users')).status()).toBe(401)
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/auth\/signin/)
})

test('real self-deletion revokes API access for the retained account row', async ({ page, localAuth }) => {
  const user = await localAuth.create('PARENT')
  await localAuth.signIn(user)
  expect((await page.request.delete('/api/account')).status()).toBe(200)
  expect((await page.request.get('/api/bookings')).status()).toBe(401)
  expect((await localAuth.database.user.findUniqueOrThrow({ where: { id: user.id } })).sessionVersion).toBe(1)
})

test('legacy cookies are denied by the API and protected-page middleware', async ({ page, context, localAuth }) => {
  const user = await localAuth.create('PARENT')
  const token = await encode({ secret: process.env.LOCAL_E2E_SECRET!, token: { sub: user.id, role: user.role } })
  await context.addCookies([{ name: 'next-auth.session-token', value: token, url: process.env.BASE_URL! }])
  expect((await page.request.get('/api/bookings')).status()).toBe(401)
  await page.goto('/parent/dashboard')
  await expect(page).toHaveURL(/\/auth\/signin/)
})
