import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { packageCommandSchema, packageSaveSchema } from '@/lib/trainer-package-schema'

const mocks = vi.hoisted(() => ({ actor: vi.fn(), read: vi.fn(), save: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getRequestUser: mocks.actor }))
vi.mock('@/lib/trainer-packages', async original => ({ ...await original<typeof import('@/lib/trainer-packages')>(), readTrainerPackages: mocks.read, saveTrainerPackage: mocks.save }))
import { GET, PUT } from '@/app/api/trainer/packages/route'
import { PackageEditError } from '@/lib/trainer-packages'
const input = { action: 'save' as const, id: '1a6a3d71-f54f-416d-afd2-c8d447523378', revision: null,
  title: 'Five sessions', description: '', priceInCents: 25000, validForDays: 90, items: [{ serviceOfferingId: 'owned-service', sessionsCount: 5 }] }
const request = (page = '') => new NextRequest(`http://localhost/api/trainer/packages${page}`)
beforeEach(() => { vi.resetAllMocks(); mocks.actor.mockResolvedValue({ id: 'trainer-user', role: 'TRAINER' }) })

describe('package input contract', () => {
  it('accepts exact integer-priced owned-service references without caller totals', () => {
    expect(packageSaveSchema.parse({ ...input, title: '  Five sessions  ' }).title).toBe('Five sessions')
  })
  it.each([
    { title: '' }, { description: 'a'.repeat(2001) }, { priceInCents: 49 }, { priceInCents: 1.5 }, { priceInCents: 100000000 },
    { validForDays: 0 }, { validForDays: 1.5 }, { validForDays: 3651 }, { revision: 'yesterday' },
    { totalSessions: 999 }, { trainerProfileId: 'other' }, { isActive: true }, { packagePurchaseId: 'pretend-paid' },
    { items: [] }, { items: [{ serviceOfferingId: 'owned-service', sessionsCount: 0 }] },
    { items: [{ serviceOfferingId: 'owned-service', sessionsCount: 1.5 }] },
    { items: [{ serviceOfferingId: 'a', sessionsCount: 600 }, { serviceOfferingId: 'b', sessionsCount: 600 }] },
    { items: [input.items[0], input.items[0]] }, { items: [{ ...input.items[0], priceInCents: 1 }] },
  ])('rejects unsupported or malformed terms: %j', change => {
    expect(packageCommandSchema.safeParse({ ...input, ...change }).success).toBe(false)
  })
  it('requires a revision and a boolean for visibility changes', () => {
    expect(packageCommandSchema.safeParse({ action: 'setActive', id: input.id, revision: new Date().toISOString(), isActive: false }).success).toBe(true)
    expect(packageCommandSchema.safeParse({ action: 'setActive', id: input.id, revision: null, isActive: false }).success).toBe(false)
    expect(packageCommandSchema.safeParse({ action: 'setActive', id: input.id, revision: new Date().toISOString(), isActive: 'true' }).success).toBe(false)
  })
})
describe('trainer package route boundaries', () => {
  it.each([null, { id: 'parent', role: 'PARENT' }, { id: 'admin', role: 'ADMIN' }])('does not access catalog data for %j', async actor => {
    mocks.actor.mockResolvedValue(actor)
    expect((await GET(request())).status).toBe(actor ? 403 : 401)
    expect((await PUT(new NextRequest('http://localhost/api/trainer/packages', { method: 'PUT', body: '{' }))).status).toBe(actor ? 403 : 401)
    expect(mocks.read).not.toHaveBeenCalled()
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it.each(['0', '-1', '1.5', '10001', 'junk'])('rejects invalid page %s', async page => {
    expect((await GET(request(`?page=${page}`))).status).toBe(400)
    expect(mocks.read).not.toHaveBeenCalled()
  })
  it('keeps a validated page and private response', async () => {
    mocks.read.mockResolvedValue({ packages: [] })
    const response = await GET(request('?page=2'))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.read).toHaveBeenCalledWith('trainer-user', 2)
  })
  it('maps model conflicts without leaking unexpected errors', async () => {
    mocks.save.mockRejectedValueOnce(new PackageEditError('Reload the package', 409)).mockRejectedValueOnce(new Error('private database details'))
    const put = () => PUT(new NextRequest('http://localhost/api/trainer/packages', { method: 'PUT', body: JSON.stringify(input) }))
    expect((await put()).status).toBe(409)
    const response = await put()
    expect(response.status).toBe(503)
    expect(JSON.stringify(await response.json())).not.toContain('private database')
  })
})
