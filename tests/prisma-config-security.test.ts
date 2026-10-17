import { createRequire } from 'node:module'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const prismaRequire = createRequire(require.resolve('@prisma/config'))
const { deepmerge, deepmergeInto } = prismaRequire('deepmerge-ts')
const { loadConfigFromFile } = require('@prisma/config')
const directories: string[] = []

function directory() {
  const path = mkdtempSync(join(tmpdir(), 'trainr-prisma-config-test-'))
  directories.push(path)
  return path
}

afterEach(() => {
  for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true })
})

describe('Prisma configuration dependency compatibility', () => {
  it.each(['cjs', 'ts'])('loads nested settings from a %s configuration', async (extension) => {
    const root = directory()
    const file = `prisma.config.${extension}`
    const config = {
      schema: 'prisma/schema.prisma',
      migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed.ts' },
    }
    writeFileSync(join(root, file), `${extension === 'cjs' ? 'module.exports =' : 'export default'} ${JSON.stringify(config)}`)
    const result = await loadConfigFromFile({ configRoot: root, configFile: file })
    expect(result.error).toBeUndefined()
    expect(result.resolvedPath).toBe(join(root, file))
    expect(result.config.schema).toBe(resolve(root, config.schema))
    expect(result.config.migrations).toMatchObject({
      path: resolve(root, config.migrations.path), seed: config.migrations.seed,
    })
  })

  it('keeps default discovery without a configuration file', async () => {
    const result = await loadConfigFromFile({ configRoot: directory() })
    expect(result.error).toBeUndefined()
    expect(result.resolvedPath).toBeNull()
    expect(result.config).toBeDefined()
  })

  it('reports an explicitly missing configuration instead of ignoring it', async () => {
    const result = await loadConfigFromFile({ configRoot: directory(), configFile: 'missing.config.ts' })
    expect(result.error?._tag).toBe('ConfigFileNotFound')
    expect(result.config).toBeUndefined()
  })

  it('merges record settings and arrays without mutating input', () => {
    const left = { migrations: { path: 'migrations' }, values: [1] }
    const right = { migrations: { seed: 'tsx seed.ts' }, values: [2] }
    expect(deepmerge(left, right)).toEqual({
      migrations: { path: 'migrations', seed: 'tsx seed.ts' }, values: [1, 2],
    })
    expect(left).toEqual({ migrations: { path: 'migrations' }, values: [1] })
    expect(right).toEqual({ migrations: { seed: 'tsx seed.ts' }, values: [2] })
  })

  // Exercise the exact transitive package loaded by Prisma, not a separate test dependency.
  it.each(['deepmerge', 'deepmergeInto'])('%s handles self-references without stack exhaustion', (method) => {
    const left: Record<string, unknown> = { left: true }
    const right: Record<string, unknown> = { right: true }
    left.self = left
    right.self = right
    const merged = method === 'deepmerge' ? deepmerge(left, right) : (deepmergeInto(left, right), left)
    expect(merged.left).toBe(true)
    expect(merged.right).toBe(true)
    expect(merged.self).toBe(merged)
  })
})
