import type { Page, TestInfo } from '@playwright/test'
import { writeFile } from 'node:fs/promises'

export async function observeHydration(page: Page, testInfo: TestInfo): Promise<() => Promise<void>> {
  if (process.env.LOCAL_HYDRATION_DEBUG !== '1') return async () => {}
  if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(process.env.BASE_URL || '')) throw new Error('Hydration diagnostics require loopback.')
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Debugger.enable')
  await cdp.send('Debugger.setPauseOnExceptions', { state: 'all' })
  let pending = Promise.resolve()
  let captured = false
  cdp.on('Debugger.paused', event => {
    pending = (async () => {
      try {
        // React queues the 418 mismatch but throws its 519 recovery sentinel.
        if (captured || !/Minified React error #(418|519)\b|Hydration failed/.test(event.data?.description || '')) return
        captured = true
        const observations: unknown[] = []
        for (const frame of event.callFrames.slice(0, 3)) {
          for (const scope of frame.scopeChain.filter(scope => ['local', 'closure'].includes(scope.type))) {
            const properties = await cdp.send('Runtime.getProperties', { objectId: scope.object.objectId!, ownProperties: true })
            for (const property of properties.result) {
              if (!property.value?.objectId || property.value.type !== 'object') continue
              const inspected = await cdp.send('Runtime.callFunctionOn', {
                objectId: property.value.objectId,
                functionDeclaration: `function () {
                  if (this && this.nodeType) return { node: this.nodeName, html: this.outerHTML?.slice(0, 2000), text: this.nodeType === 8 ? this.data : undefined };
                  if (!this || !('pendingProps' in this) || !('tag' in this)) return null;
                  const ancestors = [];
                  for (let f = this; f && ancestors.length < 12; f = f.return) {
                    const p = f.pendingProps;
                    ancestors.push({ tag: f.tag, type: typeof f.type === 'string' ? f.type : f.type?.name,
                      className: p?.className, id: p?.id, role: p?.role, text: typeof p?.children === 'string' ? p.children : undefined });
                  }
                  return { ancestors };
                }`,
                returnByValue: true,
              })
              if (inspected.result.value) observations.push({ frame: frame.functionName, scope: scope.type, variable: property.name, value: inspected.result.value })
            }
          }
        }
        const path = testInfo.outputPath('hydration-debug.json')
        await writeFile(path, JSON.stringify(observations, null, 2))
        await testInfo.attach('hydration-debug', { path, contentType: 'application/json' })
      } finally { await cdp.send('Debugger.resume').catch(() => {}) }
    })().catch(error => { console.error('Hydration diagnostic failed:', error) })
  })
  return async () => {
    await pending
    await cdp.detach()
  }
}
