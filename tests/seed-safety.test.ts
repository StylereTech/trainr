import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { runGuardedSeed, seedTarget } from '../scripts/seed-safety'

const url = 'postgresql://trainr_seed:synthetic@127.0.0.1:5433/trainr_seed_demo?schema=public'
const environment = { DATABASE_URL: url, TRAINR_ALLOW_DESTRUCTIVE_SEED: 'trainr_seed_demo' }
const identity = { database: 'trainr_seed_demo', role: 'trainr_seed', schema: 'public' }
function fixture() {
  const query = vi.fn().mockResolvedValueOnce([identity]).mockResolvedValueOnce([{ purpose: 'disposable local demo seed' }])
  const disconnect = vi.fn().mockResolvedValue(undefined)
  const db = { $queryRawUnsafe: query, $disconnect: disconnect }
  const create = vi.fn(() => db)
  const seed = vi.fn().mockResolvedValue(undefined)
  return { query, disconnect, db, create, seed }
}

describe('legacy demo seed target safety', () => {
  it.each([
    {}, { DATABASE_URL: url }, { ...environment, TRAINR_ALLOW_DESTRUCTIVE_SEED: '1' },
    { ...environment, TRAINR_ALLOW_DESTRUCTIVE_SEED: 'trainr_seed_other' },
    { ...environment, NODE_ENV: 'production' }, { ...environment, VERCEL: '1' },
    { ...environment, VERCEL_ENV: 'preview' }, { ...environment, VERCEL_ENV: 'development' },
    { ...environment, TRAINR_STAGING_INIT: 'trainr-audit-staging-20261009' },
  ])('rejects absent opt-in or hosted context before creating a client: %j', async env => {
    const f = fixture()
    await expect(runGuardedSeed(env, f.create, f.seed)).rejects.toThrow(/^SEED_/)
    expect(f.create).not.toHaveBeenCalled()
    expect(f.seed).not.toHaveBeenCalled()
  })

  it.each([
    'not-a-url', url.replace('postgresql:', 'https:'), url.replace('127.0.0.1', 'example.neon.tech'),
    url.replace('127.0.0.1', 'localhost.example.test'), url.replace('127.0.0.1', '[::1]'),
    url.replace('trainr_seed:', 'postgres:'), url.replace('trainr_seed:', 'trainr%5Fseed:'),
    url.replace('/trainr_seed_demo', '/trainr'), url.replace('/trainr_seed_demo', '/trainr_seed_demo/other'),
    url.replace('/trainr_seed_demo', '/trainr_seed_%64emo'), url.replace('schema=public', 'schema=private'),
    `${url}&schema=private`, `${url}&schema=public`, `${url}&host=remote.example.test`,
    `${url}&options=-csearch_path=private`, `${url}&sslmode=require`, `${url}#hidden`,
  ])('rejects ambiguous target without connecting: %s', async value => {
    const f = fixture()
    await expect(runGuardedSeed({ ...environment, DATABASE_URL: value }, f.create, f.seed)).rejects.toThrow('SEED_TARGET_INVALID')
    expect(f.create).not.toHaveBeenCalled()
  })

  it.each(['127.0.0.1', 'localhost'])('accepts an explicitly opted-in disposable %s target', host => {
    const value = url.replace('127.0.0.1', host)
    expect(seedTarget({ ...environment, DATABASE_URL: value })).toEqual({ url: value, database: 'trainr_seed_demo' })
  })

  it('only invokes seed after both database-side checks and always disconnects', async () => {
    const f = fixture()
    f.seed.mockImplementation(async () => { expect(f.query).toHaveBeenCalledTimes(2) })
    await runGuardedSeed(environment, f.create, f.seed)
    expect(f.create).toHaveBeenCalledWith(url)
    expect(f.query).toHaveBeenNthCalledWith(1, 'SELECT current_database() AS database, current_user AS role, current_schema() AS schema')
    expect(f.query).toHaveBeenNthCalledWith(2, 'SELECT purpose FROM public.trainr_seed_guard')
    expect(f.seed).toHaveBeenCalledExactlyOnceWith(f.db)
    expect(f.disconnect).toHaveBeenCalledOnce()
  })

  it.each([[], [identity, identity], [{ ...identity, database: 'production' }],
    [{ ...identity, role: 'postgres' }], [{ ...identity, schema: 'private' }]].map(rows => ({ rows })))('rejects wrong actual database identity: %j', async ({ rows }) => {
    const f = fixture()
    f.query.mockReset().mockResolvedValueOnce(rows)
    await expect(runGuardedSeed(environment, f.create, f.seed)).rejects.toThrow('SEED_DATABASE_IDENTITY_MISMATCH')
    expect(f.query).toHaveBeenCalledTimes(1)
    expect(f.seed).not.toHaveBeenCalled()
    expect(f.disconnect).toHaveBeenCalledOnce()
  })

  it.each([[], [{ purpose: 'production' }], [{ purpose: 'disposable local demo seed' }, { purpose: 'disposable local demo seed' }]].map(rows => ({ rows })))('rejects absent or ambiguous ownership marker: %j', async ({ rows }) => {
    const f = fixture()
    f.query.mockReset().mockResolvedValueOnce([identity]).mockResolvedValueOnce(rows)
    await expect(runGuardedSeed(environment, f.create, f.seed)).rejects.toThrow('SEED_OWNERSHIP_REQUIRED')
    expect(f.seed).not.toHaveBeenCalled()
    expect(f.disconnect).toHaveBeenCalledOnce()
  })

  it.each([1, 2])('fails closed when read-only preflight query %i fails', async step => {
    const f = fixture()
    f.query.mockReset()
    if (step === 2) f.query.mockResolvedValueOnce([identity])
    f.query.mockRejectedValueOnce(new Error('synthetic preflight failure'))
    await expect(runGuardedSeed(environment, f.create, f.seed)).rejects.toThrow('synthetic preflight failure')
    expect(f.seed).not.toHaveBeenCalled()
    expect(f.disconnect).toHaveBeenCalledOnce()
  })

  it('propagates a seed failure without retrying and disconnects', async () => {
    const f = fixture()
    f.seed.mockRejectedValueOnce(new Error('synthetic write failure'))
    await expect(runGuardedSeed(environment, f.create, f.seed)).rejects.toThrow('synthetic write failure')
    expect(f.seed).toHaveBeenCalledOnce()
    expect(f.disconnect).toHaveBeenCalledOnce()
  })

  it('wires the actual entry point through the guard without a top-level Prisma client', () => {
    const source = readFileSync(new URL('../prisma/seed.ts', import.meta.url), 'utf8')
    const file = ts.createSourceFile('seed.ts', source, ts.ScriptTarget.Latest, true)
    const calls: ts.CallExpression[] = []
    const visit = (node: ts.Node) => { if (ts.isCallExpression(node)) calls.push(node); ts.forEachChild(node, visit) }
    visit(file)
    const guarded = calls.filter(call => call.expression.getText(file) === 'runGuardedSeed')
    expect(guarded).toHaveLength(1)
    expect(guarded[0].arguments.map(arg => arg.getText(file))).toEqual([
      'process.env', 'url => new PrismaClient({ datasourceUrl: url })', 'main',
    ])
    expect(calls.filter(call => call.expression.getText(file) === 'main')).toHaveLength(0)
    expect(file.statements.filter(ts.isVariableStatement).flatMap(statement => [...statement.declarationList.declarations])
      .some(declaration => declaration.initializer && ts.isNewExpression(declaration.initializer) && declaration.initializer.expression.getText(file) === 'PrismaClient')).toBe(false)
    expect(source).toContain('process.exitCode = 1')
    expect(source).toContain("error instanceof SeedSafetyError ? error.message : 'SEED_FAILED'")
  })
})
