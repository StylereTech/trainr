import { describe, expect, it, vi } from 'vitest'

const query = vi.hoisted(() => vi.fn())
vi.mock('@/lib/prisma', () => ({ prisma: { $queryRaw: query } }))

describe('Public health endpoint', () => {
  it('reports an unavailable database without exposing connection diagnostics', async () => {
    query.mockRejectedValue(new Error('postgresql://private-user:secret@private-host/database'))
    const { GET } = await import('@/app/api/health/route')
    const response = await GET()
    const body = await response.json()
    expect(response.status).toBe(503)
    expect(body).toEqual({ ok: false, dbConnected: false, timestamp: expect.any(String), uptimeMs: expect.any(Number) })
    expect(JSON.stringify(body)).not.toContain('secret')
  })

  it('returns healthy only after the database query succeeds', async () => {
    query.mockResolvedValue([{ '?column?': 1 }])
    const { GET } = await import('@/app/api/health/route')
    const response = await GET()
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, dbConnected: true })
  })
})
