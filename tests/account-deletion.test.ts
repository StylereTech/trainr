import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(__dirname, '..')
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('App Review account deletion compliance', () => {
  it('exposes an authenticated in-app account deletion page and API route', () => {
    const page = read('src/app/account/delete/page.tsx')
    const api = read('src/app/api/account/route.ts')

    expect(page).toContain('Delete your Trainr account')
    expect(page).toContain("fetch('/api/account', { method: 'DELETE' })")
    expect(page).toContain('No phone call or email is required')
    expect(api).toContain('export async function DELETE')
    expect(api).toContain('getRequestUser')
    expect(api).toContain('passwordHash: randomPasswordHash')
    expect(api).toContain('deleted.trainr.local')
  })

  it('links account settings from the signed-in navigation on desktop and mobile', () => {
    const navbar = read('src/components/layout/Navbar.tsx')
    expect(navbar).toContain('href="/account/delete"')
    expect(navbar).toContain('Account Settings')
  })

  it('updates the privacy policy with direct in-app deletion wording', () => {
    const privacy = read('src/app/legal/privacy/page.tsx')
    expect(privacy).toContain('Last updated: May 12, 2026')
    expect(privacy).toContain('Delete Account')
    expect(privacy).toContain('removes or anonymizes')
  })
})
