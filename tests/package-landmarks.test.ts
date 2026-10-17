import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import ts from 'typescript'

function mainLandmarks(path: string) {
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const matches: ts.Node[] = []
  function visit(node: ts.Node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (node.tagName.getText(source) === 'main' || node.attributes.properties.some(attribute =>
        ts.isJsxAttribute(attribute) && attribute.name.getText(source) === 'role'
        && attribute.initializer && ts.isStringLiteral(attribute.initializer) && attribute.initializer.text === 'main')) matches.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return matches.length
}

describe('package pages use the root layout main landmark', () => {
  it('keeps one main landmark in the root layout', () => {
    expect(mainLandmarks('src/app/layout.tsx')).toBe(1)
  })
  it.each([
    'src/components/shared/PackagePurchaseHistory.tsx',
    'src/components/shared/PackageCheckout.tsx',
    'src/app/trainer/packages/page.tsx',
    'src/app/parent/packages/[purchaseId]/book/page.tsx',
    'src/app/admin/layout.tsx',
  ])('%s does not introduce a nested main', path => {
    expect(mainLandmarks(path)).toBe(0)
  })
})
