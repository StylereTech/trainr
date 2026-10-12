import { createRequire } from 'node:module'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { request } from 'node:http'
import { execFileSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'
import type { BuildContext } from 'esbuild'

const require = createRequire(import.meta.url)
const roots: string[] = []
const contexts: BuildContext[] = []
function directory() {
  const root = mkdtempSync(join(tmpdir(), 'trainr-esbuild-test-'))
  roots.push(root)
  return root
}
afterEach(async () => {
  for (const context of contexts.splice(0)) await context.dispose()
  for (const root of roots.splice(0)) {
    if (dirname(resolve(root)) !== resolve(tmpdir()) || !root.includes('trainr-esbuild-test-')) throw new Error('Unsafe fixture cleanup')
    rmSync(root, { recursive: true, force: true })
  }
})

function get(port: number, path: string) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method: 'GET' }, response => {
      let body = ''
      response.setEncoding('utf8')
      response.on('data', chunk => { body += chunk })
      response.on('end', () => resolve({ status: response.statusCode!, body }))
    })
    req.on('error', reject)
    req.setTimeout(5000, () => req.destroy(new Error('Fixture request timeout')))
    req.end()
  })
}

describe.each(['tsx', 'vite'])('%s resolved esbuild', consumer => {
  const loader = createRequire(require.resolve(consumer))
  const esbuild: typeof import('esbuild') = loader('esbuild')

  it('bundles TypeScript with imports and source maps', async () => {
    const root = directory()
    writeFileSync(join(root, 'value.ts'), 'export const amount: number = 2400')
    writeFileSync(join(root, 'entry.ts'), "import { amount } from './value'; console.log(amount / 2)")
    const result = await esbuild.build({ entryPoints: [join(root, 'entry.ts')], bundle: true, platform: 'node', format: 'cjs',
      write: false, sourcemap: 'inline', logLevel: 'silent' })
    expect(execFileSync(process.execPath, ['-e', result.outputFiles![0].text], { encoding: 'utf8', timeout: 10000 }).trim()).toBe('1200')
    expect(result.outputFiles![0].text).toContain('sourceMappingURL=data:application/json')
  })

  it('does not serve a sibling synthetic file through backslash traversal', async () => {
    const root = directory(), publicDir = join(root, 'public')
    mkdirSync(publicDir)
    writeFileSync(join(publicDir, 'index.html'), 'synthetic-public-page')
    writeFileSync(join(root, 'private.txt'), 'synthetic-outside-servedir')
    const context = await esbuild.context({ stdin: { contents: 'console.log(1)', loader: 'js' }, outfile: join(publicDir, 'bundle.js'), logLevel: 'silent' })
    contexts.push(context)
    const { port } = await context.serve({ host: '127.0.0.1', port: 0, servedir: publicDir })
    expect(await get(port, '/index.html')).toEqual({ status: 200, body: 'synthetic-public-page' })
    for (const path of ['/..\\private.txt', '/%2e%2e%5cprivate.txt']) {
      const response = await get(port, path)
      expect(response.body, path).not.toContain('synthetic-outside-servedir')
      expect([400, 403, 404], path).toContain(response.status)
    }
  })
})

it('runs existing tsx-style TypeScript scripts with relative imports', () => {
  const root = directory()
  writeFileSync(join(root, 'value.ts'), 'export const count: number = 3')
  writeFileSync(join(root, 'entry.ts'), "import { count } from './value'; console.log(JSON.stringify({ count }))")
  const result = execFileSync(process.execPath, [require.resolve('tsx/cli'), join(root, 'entry.ts')], { encoding: 'utf8', timeout: 15000 })
  expect(JSON.parse(result)).toEqual({ count: 3 })
})
