import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const selectors = [
  '.flex', '.hover\\:bg-primary:hover', '.sm\\:grid-cols-2',
  '.group:hover .group-hover\\:opacity-100', '.peer:checked ~ .peer-checked\\:block',
  '[data-state="open"] > :not([hidden]) ~ :not([hidden])',
  '.dark\\:bg-background:is(.dark *)', ':is(.a, #b):not(:has(> .c))',
  '.w-\\[calc\\(100\\%-2rem\\)\\]', 'svg|a[href^="https:"]::before',
  '.a/* preserved */ > .b, .c + .d', '[aria-label="A, B"]:nth-child(2n + 1)',
]

describe.each(['tailwindcss', 'postcss-nested'])('%s selector parser', consumer => {
  const loader = createRequire(require.resolve(consumer))
  const parser: typeof import('postcss-selector-parser') = loader('postcss-selector-parser')

  it.each(selectors)('preserves selector %s', selector => {
    expect(parser().processSync(selector)).toBe(selector)
  })

  it('parses a bounded large flat selector without quadratic exhaustion', () => {
    // A subprocess timeout bounds even a vulnerable parser; no server input is used.
    const source = `const p = require(${JSON.stringify(loader.resolve('postcss-selector-parser'))});
      const text = '.a'.repeat(100000);
      const root = p().astSync(text);
      console.log(JSON.stringify({ count: root.first.nodes.length, same: root.toString() === text }));`
    const output = execFileSync(process.execPath, ['-e', source], { encoding: 'utf8', timeout: 5000, maxBuffer: 1024 })
    expect(JSON.parse(output)).toEqual({ count: 100000, same: true })
  }, 10000)
})

it('preserves nested component selectors and declarations', async () => {
  const postcss: typeof import('postcss').default = require('postcss')
  const nested = require('postcss-nested')
  const result = await postcss([nested]).process('.booking { color: red; &:hover, &[data-state="open"] { color: blue; } > .price { font-weight: 600; } }', { from: undefined })
  expect(result.css).toBe('.booking { color: red; } .booking:hover, .booking[data-state="open"] { color: blue; } .booking > .price { font-weight: 600; }')
})
