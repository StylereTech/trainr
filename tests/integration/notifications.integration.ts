import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { encode } from 'next-auth/jwt'
import { prisma } from '@/lib/prisma'
import { GET, PATCH } from '@/app/api/notifications/route'
import { changeNotifications, readNotifications } from '@/lib/notifications'
import type { User } from '@prisma/client'

const secret = 'synthetic-inbox-session-only'
const users: string[] = []
async function user(role: 'PARENT' | 'TRAINER' | 'ADMIN' = 'PARENT') {
  const row = await prisma.user.create({ data: { email: `inbox-${randomUUID()}@example.test`, passwordHash: 'not-a-login', role } })
  users.push(row.id); return row
}
async function request(actor?: User, body?: unknown, query = '') {
  const token = actor ? await encode({ secret, token: { sub: actor.id, role: actor.role, sessionVersion: actor.sessionVersion } }) : ''
  return new NextRequest(`http://localhost/api/notifications${query}`, { method: body === undefined ? 'GET' : 'PATCH',
    headers: { cookie: `next-auth.session-token=${token}`, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
}
async function notice(userId: string, type = 'NEW_MESSAGE', data = {}) {
  return prisma.notification.create({ data: { userId, type, title: 'Synthetic notice', message: 'Synthetic message', data } })
}
beforeAll(async () => {
  vi.stubEnv('NEXTAUTH_SECRET', secret)
  expect(await prisma.$queryRaw`SELECT purpose FROM trainr_test_guard`).toEqual([{ purpose: 'disposable integration database' }])
})
afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: users } } }); await prisma.$disconnect(); vi.unstubAllEnvs()
})

describe('real notification API, encrypted sessions and SQL', () => {
  it('rejects anonymous reads and writes', async () => {
    expect((await GET(await request())).status).toBe(401)
    expect((await PATCH(await request(undefined, { ids: ['other'], read: true }))).status).toBe(401)
  })
  it.each(['PARENT', 'TRAINER', 'ADMIN'] as const)('pages all 55 tied records for %s and scopes counts/rows to the recipient', async role => {
    const actor = await user(role), other = await user()
    await notice(other.id)
    await prisma.notification.createMany({ data: Array.from({ length: 55 }, (_, i) => ({ userId: actor.id, title: `Notice ${i}`, message: 'test', type: 'NEW_MESSAGE', createdAt: new Date('2026-01-01'), readAt: i < 4 ? new Date() : null })) })
    const ids = []
    for (const page of [1, 2, 3]) {
      const response = await GET(await request(actor, undefined, `?page=${page}`))
      expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('private, no-store')
      const body = await response.json()
      expect(body.unreadCount).toBe(51); expect(body.pagination.total).toBe(55)
      ids.push(...body.notifications.map((n: { id: string }) => n.id))
      expect(JSON.stringify(body)).not.toContain('userId')
    }
    expect(new Set(ids).size).toBe(55)
    expect(ids).toEqual([...ids].sort().reverse())
    const unread = await (await GET(await request(actor, undefined, '?view=unread&page=100'))).json()
    expect(unread.pagination).toMatchObject({ page: 3, total: 51 })
    expect(unread.notifications.every((n: { readAt: unknown }) => n.readAt === null)).toBe(true)
  })
  it.each(['?page=0', '?limit=51', '?userId=someone', '?view=bad'])('rejects malformed query %s', async query => {
    expect((await GET(await request(await user(), undefined, query))).status).toBe(400)
  })
  it('marks explicit IDs idempotently, leaves later arrivals unread and supports undo', async () => {
    const actor = await user(), first = await notice(actor.id)
    const action = { ids: [first.id], read: true }
    expect((await PATCH(await request(actor, action))).status).toBe(200)
    const readAt = (await prisma.notification.findUniqueOrThrow({ where: { id: first.id } })).readAt
    const later = await notice(actor.id)
    expect((await PATCH(await request(actor, action))).status).toBe(200)
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: first.id } })).readAt).toEqual(readAt)
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: later.id } })).readAt).toBeNull()
    expect((await PATCH(await request(actor, { ...action, read: false }))).status).toBe(200)
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: first.id } })).readAt).toBeNull()
  })
  it('rejects mixed owned/foreign IDs atomically, including for admins', async () => {
    const actor = await user('ADMIN'), other = await user(), own = await notice(actor.id), foreign = await notice(other.id)
    expect((await PATCH(await request(actor, { ids: [own.id, foreign.id], read: true }))).status).toBe(404)
    expect(await prisma.notification.count({ where: { id: { in: [own.id, foreign.id] }, readAt: null } })).toBe(2)
    expect((await PATCH(await request(actor, { ids: ['absent'], read: true }))).status).toBe(404)
  })
  it.each([{ markAllRead: true }, { ids: ['a'], read: 'true' }, { ids: [], read: true }])('rejects broad or invalid mutation %j', async input => {
    expect((await PATCH(await request(await user(), input))).status).toBe(400)
  })
  it('rejects malformed JSON as a client error', async () => {
    const req = await request(await user(), {})
    expect((await PATCH(new NextRequest(req.url, { method: 'PATCH', headers: req.headers, body: '{' }))).status).toBe(400)
  })
  it('revokes old cookies and hides historical administrator notices after a fresh demoted login', async () => {
    const actor = await user('ADMIN')
    const warning = await notice(actor.id, 'PAYMENT_REVIEW_REQUIRED', { bookingId: 'not-owned' })
    await notice(actor.id, 'NEW_TRAINER_SIGNUP')
    await notice(actor.id)
    expect((await (await GET(await request(actor))).json()).notifications).toHaveLength(3)
    const demoted = await prisma.user.update({ where: { id: actor.id }, data: { role: 'PARENT', sessionVersion: { increment: 1 } } })
    expect((await GET(await request(actor))).status).toBe(401)
    expect((await (await GET(await request(demoted))).json()).pagination.total).toBe(1)
    expect((await PATCH(await request(demoted, { ids: [warning.id], read: true }))).status).toBe(404)
    await expect(readNotifications(actor, { page: 1, limit: 20, view: 'all' })).rejects.toMatchObject({ status: 401 })
  })
  it('rejects deactivated users even if a service caller retained old identity', async () => {
    const actor = await user(), row = await notice(actor.id)
    await prisma.user.update({ where: { id: actor.id }, data: { deletedAt: new Date(), sessionVersion: { increment: 1 } } })
    expect((await GET(await request(actor))).status).toBe(401)
    await expect(changeNotifications(actor, { ids: [row.id], read: true })).rejects.toMatchObject({ status: 401 })
  })
  it('only exposes whitelisted metadata, never arbitrary provider evidence or links', async () => {
    const actor = await user('ADMIN')
    await notice(actor.id, 'PAYMENT_REVIEW_REQUIRED', { bookingId: 'b', financialReview: { secret: 'private' }, url: 'javascript:bad', secret: 'hidden' })
    const body = await (await GET(await request(actor))).json()
    expect(body.notifications[0]).toMatchObject({ bookingId: 'b', financialReview: null, reviewUnavailable: true })
    expect(JSON.stringify(body)).not.toMatch(/javascript|secret|hidden/)
  })
})
