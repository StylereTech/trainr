import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET, PUT } from '@/app/api/trainer/onboarding/route'

const mock = vi.hoisted(() => ({ session: vi.fn(), profile: vi.fn(), transaction: vi.fn(), query: vi.fn(), deleteSlots: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getServerSession: mock.session, authOptions: {} }))
vi.mock('@/lib/prisma', () => ({ prisma: { trainerProfile: { findUnique: mock.profile }, $transaction: mock.transaction } }))
let state: any
let fail = false
const revision = '2026-10-01T00:00:00.000Z'
const baseService = { title: 'First session', description: '', durationMinutes: 60, priceInCents: 6000, type: 'INDIVIDUAL', maxParticipants: 1 }
const first = { id: 'first', ...baseService }
const second = { id: 'second', ...baseService, title: 'Second session' }
const input = { revision, firstName: 'Test', lastName: 'Trainer', yearsExperience: 1, locationType: 'BOTH',
  sports: ['basketball'], specialties: ['shooting'], services: [first, second],
  availability: [{ dayOfWeek: 1, startTime: '09:00', endTime: '12:00' }, { dayOfWeek: 1, startTime: '13:00', endTime: '17:00' }] }
const save = (change = {}) => PUT(new Request('http://localhost/api/trainer/onboarding', { method: 'PUT', body: JSON.stringify({ ...input, ...change }) }) as any)

beforeEach(() => {
  vi.resetAllMocks()
  fail = false
  state = {
    profile: { id: 'trainer', userId: 'trainer-user', updatedAt: new Date(revision), ...input,
      sports: [], specialties: [], certifications: [], user: { email: 'trainer@example.test' } },
    services: [first, second].map((service) => ({ ...service, trainerProfileId: 'trainer', isActive: true, sportId: 'sport', _count: { bookings: 0, packageItems: 0 } })),
    slots: input.availability.map((slot) => ({ ...slot, isRecurring: true, isAvailable: true, specificDate: null })),
  }
  state.slots.push({ dayOfWeek: null, startTime: '10:00', endTime: '11:00', isRecurring: false, isAvailable: false, specificDate: '2026-11-02' })
  mock.session.mockResolvedValue({ user: { id: 'trainer-user', role: 'TRAINER' } })
  mock.profile.mockImplementation(async () => ({ ...state.profile, serviceOfferings: state.services.filter((s: any) => s.isActive),
    availabilitySlots: state.slots.filter((s: any) => s.isAvailable && s.isRecurring && !s.specificDate) }))
  let tail = Promise.resolve()
  mock.transaction.mockImplementation(async (run) => {
    const previous = tail
    let release!: () => void
    tail = new Promise<void>((resolve) => { release = resolve })
    await previous
    const before = structuredClone(state)
    try {
      return await run({
        $queryRaw: mock.query,
        trainerProfile: {
          findUnique: async () => state.profile,
          update: async ({ data }: any) => { Object.assign(state.profile, data); return state.profile },
        },
        serviceOffering: {
          count: async () => state.services.length,
          findMany: async () => structuredClone(state.services),
          update: async ({ where, data }: any) => {
            const service = state.services.find((s: any) => s.id === where.id)
            Object.assign(service, data)
            return structuredClone(service)
          },
          create: async ({ data }: any) => {
            const service = { ...data, id: `new-${state.services.length}`, isActive: true, _count: { bookings: 0, packageItems: 0 } }
            state.services.push(service)
            return structuredClone(service)
          },
        },
        trainerSport: { deleteMany: async () => {}, create: async () => {} },
        trainerSpecialty: { deleteMany: async () => {}, create: async () => {} },
        sport: { findUnique: async () => ({ id: 'sport' }) },
        specialty: { findFirst: async () => ({ id: 'specialty' }) },
        certification: { deleteMany: async () => {}, create: async () => {} },
        availabilitySlot: {
          deleteMany: mock.deleteSlots.mockImplementation(async ({ where }) => {
            state.slots = state.slots.filter((s: any) => !(s.isAvailable === where.isAvailable && s.isRecurring === where.isRecurring && s.specificDate === where.specificDate))
          }),
          create: async ({ data }: any) => {
            if (fail) throw new Error('private database error')
            state.slots.push({ ...data, isAvailable: true, specificDate: null })
          },
        },
      })
    } catch (error) { state = before; throw error } finally { release() }
  })
})

describe('trainer profile edit integrity (transaction model)', () => {
  it('keeps identity when services are reordered', async () => {
    const response = await save({ services: [second, first] })
    expect(response.status).toBe(200)
    expect((await response.json()).services.map((s: any) => s.id)).toEqual(['second', 'first'])
    expect(state.services.find((s: any) => s.id === 'first').title).toBe('First session')
    expect(state.services).toHaveLength(2)
  })
  it('archives removed services without deleting history or shifting identity', async () => {
    expect((await save({ services: [second] })).status).toBe(200)
    expect(state.services[0]).toMatchObject({ id: 'first', title: 'First session', isActive: false })
    expect(state.services[1]).toMatchObject({ id: 'second', title: 'Second session', isActive: true })
  })
  it('updates unreferenced services in place', async () => {
    await save({ services: [{ ...first, title: 'Edited' }, second] })
    expect(state.services[0].title).toBe('Edited')
    expect(state.services).toHaveLength(2)
  })
  it.each(['bookings', 'packageItems'])('versions changed terms referenced by %s', async (reference) => {
    state.services[0]._count[reference] = 1
    const response = await save({ services: [{ ...first, title: 'New terms', priceInCents: 8000 }, second] })
    const body = await response.json()
    expect(state.services[0]).toMatchObject({ id: 'first', title: 'First session', priceInCents: 6000, isActive: false })
    expect(body.services[0]).toMatchObject({ title: 'New terms', priceInCents: 8000 })
    expect(body.services[0].id).not.toBe('first')
    expect(state.services[2].sportId).toBe('sport')
  })
  it('does not version unchanged booked services or empty descriptions', async () => {
    state.services[0]._count.bookings = 3
    await save()
    expect(state.services).toHaveLength(2)
    expect(state.services[0].isActive).toBe(true)
  })
  it.each([{ services: [{ ...first, id: 'foreign' }] }, { services: [first, first] }])('rejects foreign/stale/duplicate IDs before writes: %j', async ({ services }) => {
    expect((await save({ services })).status).toBe(409)
    expect(state.profile.updatedAt.toISOString()).toBe(revision)
    expect(state.services).toHaveLength(2)
  })
  it('rejects an inactive ID instead of reactivating an old offering', async () => {
    state.services[0].isActive = false
    expect((await save()).status).toBe(409)
  })
  it('rejects stale profile revisions and missing revision on an existing profile', async () => {
    expect((await save({ revision: '2026-09-01T00:00:00.000Z' })).status).toBe(409)
    expect((await save({ revision: undefined })).status).toBe(409)
    expect(mock.deleteSlots).not.toHaveBeenCalled()
  })
  it('allows only one save from the same revision in the serial model', async () => {
    const responses = await Promise.all([save(), save()])
    expect(responses.map((response) => response.status)).toEqual([200, 409])
  })
  it('returns current IDs and revision for a second save without creating duplicates', async () => {
    state.services[0]._count.bookings = 1
    const body = await (await save({ services: [{ ...first, title: 'Version 2' }, second] })).json()
    expect((await save({ revision: body.revision, services: body.services })).status).toBe(200)
    expect(state.services).toHaveLength(3)
  })
  it('allows first onboarding without a revision', async () => {
    state.services = []
    expect((await save({ revision: undefined, services: [baseService] })).status).toBe(200)
    expect(state.services).toHaveLength(1)
  })
  it('preserves date exceptions and all submitted weekly windows', async () => {
    await save()
    expect(state.slots).toHaveLength(3)
    expect(state.slots[0]).toMatchObject({ specificDate: '2026-11-02', isAvailable: false })
    expect(mock.deleteSlots).toHaveBeenCalledWith({ where: { trainerProfileId: 'trainer', isAvailable: true, isRecurring: true, specificDate: null } })
  })
  it('can close the weekly schedule without deleting exceptions', async () => {
    expect((await save({ availability: [] })).status).toBe(200)
    expect(state.slots).toHaveLength(1)
  })
  it('rolls back service version, archive and revision if a later write fails', async () => {
    state.services[0]._count.bookings = 1
    fail = true
    const response = await save({ services: [{ ...first, title: 'New terms' }] })
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('private database')
    expect(state.services).toHaveLength(2)
    expect(state.services[0].isActive).toBe(true)
    expect(state.profile.updatedAt.toISOString()).toBe(revision)
  })
  it.each([{ priceInCents: 1500.5 }, { durationMinutes: 0 }, { maxParticipants: -1 }, { title: ' ' }])('rejects invalid service data %j', async (change) => {
    expect((await save({ services: [{ ...first, ...change }] })).status).toBe(400)
    expect(mock.transaction).not.toHaveBeenCalled()
  })
  it.each([{ startTime: '99:00' }, { endTime: '08:00' }, { dayOfWeek: 1.5 }])('rejects malformed weekly availability %j', async (change) => {
    expect((await save({ availability: [{ ...input.availability[0], ...change }] })).status).toBe(400)
  })
  it('returns the revision and only editable weekly windows', async () => {
    const response = await GET(new Request('http://localhost/api/trainer/onboarding') as any)
    const body = await response.json()
    expect(body.revision).toBe(revision)
    expect(body.availability).toHaveLength(2)
    expect(body.services.map((s: any) => s.id)).toEqual(['first', 'second'])
    expect(mock.profile.mock.calls[0][0].include.availabilitySlots.where).toEqual({ isAvailable: true, isRecurring: true, specificDate: null })
  })
  it.each(['PARENT', 'ADMIN'])('rejects %s profile mutation', async (role) => {
    mock.session.mockResolvedValue({ user: { id: 'trainer-user', role } })
    expect((await save()).status).toBe(403)
  })
})
