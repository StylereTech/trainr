import { beforeEach, expect, it, vi } from 'vitest'
import { GET, POST } from '@/app/api/admin/settings/route'
import { defaultFeeValues, effectiveFeeValues, updateFeeConfiguration } from '@/lib/fee-config'

const mock = vi.hoisted(() => ({ user: vi.fn(), transaction: vi.fn(), query: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getRequestUser: mock.user }))
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: mock.transaction } }))
let state: any
let fail: boolean
const request = (body: unknown = { ...defaultFeeValues, expectedConfigId: null }) => new Request('http://localhost/api/admin/settings', { method: 'POST', body: JSON.stringify(body) }) as any
beforeEach(() => {
  vi.resetAllMocks()
  mock.user.mockResolvedValue({ id: 'admin', role: 'ADMIN' })
  state = { configs: [], audits: [] }
  fail = false
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
        feeConfig: {
          findMany: async ({ where }: any) => structuredClone(where ? state.configs.filter((row: any) => row.isActive) : state.configs),
          findFirst: async () => structuredClone(state.configs.find((row: any) => row.isActive) || null),
          updateMany: async () => { state.configs.forEach((row: any) => { row.isActive = false }) },
          create: async ({ data }: any) => { const row = { id: `config-${state.configs.length}`, ...data }; state.configs.push(row); return structuredClone(row) },
        },
        adminAction: { create: async ({ data }: any) => { if (fail) throw new Error('private diagnostic'); state.audits.push(data) } },
      })
    } catch (error) { state = before; throw error } finally { release() }
  })
})

it('returns explicit defaults and no invented active configuration', async () => {
  expect(await (await GET(request())).json()).toEqual({ configs: [], active: null, defaults: defaultFeeValues })
})
it.each(['PARENT', 'TRAINER', undefined])('rejects settings access for %s', async (role) => {
  mock.user.mockResolvedValue({ id: 'user', role })
  expect((await GET(request())).status).toBe(403)
  expect((await POST(request())).status).toBe(403)
  expect(mock.transaction).not.toHaveBeenCalled()
})
it('requires authentication', async () => {
  mock.user.mockResolvedValue(null)
  expect((await GET(request())).status).toBe(401)
  expect((await POST(request())).status).toBe(401)
})
it.each([
  { platformCommissionPercent: -1 }, { platformCommissionPercent: 51 }, { platformCommissionPercent: '20' },
  { stripeFeePercent: 11 }, { processingFeeCents: 0.5 }, { minBookingAmountCents: 1499 },
  { minBookingAmountCents: 10000001 }, { expectedConfigId: undefined }, { isActive: false },
])('rejects malformed configuration %j before writes', async (change) => {
  expect((await POST(request({ ...defaultFeeValues, expectedConfigId: null, ...change }))).status).toBe(400)
  expect(mock.transaction).not.toHaveBeenCalled()
})
it('commits configuration and audit together and deactivates its predecessor', async () => {
  const first = await (await POST(request())).json()
  const response = await POST(request({ ...defaultFeeValues, platformCommissionPercent: 20, expectedConfigId: first.id }))
  expect(response.status).toBe(201)
  expect(state.configs.map((row: any) => row.isActive)).toEqual([false, true])
  expect(state.audits).toHaveLength(2)
  expect(state.audits[1].metadata.previousConfigIds).toEqual([first.id])
})
it('allows one concurrent update from the same revision in the transaction model', async () => {
  const responses = await Promise.all([POST(request()), POST(request())])
  expect(responses.map((r) => r.status).sort()).toEqual([201, 409])
  expect(state.audits).toHaveLength(1)
})
it('rolls back config changes when audit persistence fails', async () => {
  const first = await updateFeeConfiguration('admin', { ...defaultFeeValues, expectedConfigId: null })
  fail = true
  const response = await POST(request({ ...defaultFeeValues, expectedConfigId: first.id, platformCommissionPercent: 25 }))
  expect(response.status).toBe(503)
  expect(await response.text()).not.toContain('private diagnostic')
  expect(state.configs).toHaveLength(1)
  expect(state.configs[0].isActive).toBe(true)
  expect(state.audits).toHaveLength(1)
})
it.each([{ configs: [] }, { configs: [defaultFeeValues] }])('reads defaults or valid effective configuration %j', async ({ configs }) => {
  expect(await effectiveFeeValues({ feeConfig: { findMany: async () => configs } } as any)).toEqual(defaultFeeValues)
})
it.each([{ configs: [{ ...defaultFeeValues, platformCommissionPercent: -1 }] }, { configs: [defaultFeeValues, defaultFeeValues] }])('fails closed for invalid/ambiguous settings', async ({ configs }) => {
  await expect(effectiveFeeValues({ feeConfig: { findMany: async () => configs } } as any)).rejects.toThrow('administrator review')
})
