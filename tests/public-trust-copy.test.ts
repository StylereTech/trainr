import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const publicFiles = [
  'src/app/page.tsx',
  'src/app/about/page.tsx',
  'src/app/sports/page.tsx',
  'src/app/how-it-works/page.tsx',
  'src/app/faq/page.tsx',
  'src/app/for-trainers/page.tsx',
  'src/app/layout.tsx',
  'src/app/auth/signin/page.tsx',
  'src/app/auth/signup/page.tsx',
  'src/app/browse/page.tsx',
  'src/app/book/[slug]/page.tsx',
  'src/app/trainers/[slug]/page.tsx',
  'src/app/trainer/[slug]/page.tsx',
  'src/components/layout/Footer.tsx',
  'src/components/shared/TrainerCard.tsx',
]

describe('public trust claims', () => {
  it.each(publicFiles)('%s does not assert blanket screening or verified reviews', path => {
    const source = readFileSync(path, 'utf8')
    expect(source).not.toMatch(/background[- ](?:checked|verified)|identity verified|vetted (?:youth|trainers|coaches)|verified (?:trainers|coaches|profiles?|(?:parent )?reviews)|every trainer verified/i)
    expect(source).not.toMatch(/redesigned profile|cleaner mobile scan|Why this profile now converts better|Trainr premium platform/)
  })

  it('does not present hard-coded platform counts or testimonials as evidence', () => {
    const source = readFileSync('src/app/page.tsx', 'utf8')
    expect(source).not.toMatch(/500\+|5,000\+|Average Rating|Hundreds of coaches|Sarah M\.|David R\.|Lisa K\.|testimonials\.map/)
  })

  it.each(['trainers', 'trainer'])('%s profile distinguishes individual credential status from screening', route => {
    const source = readFileSync(`src/app/${route}/[slug]/page.tsx`, 'utf8')
    expect(source).toContain("cert.isVerified ? 'Marked verified' : 'Not verified'")
    expect(source).toContain('Profile approval does not establish identity or background screening.')
    expect(source).toContain('href="/legal/safety"')
  })

  it('safety guidance does not guarantee universal checks or a response SLA', () => {
    const source = readFileSync('src/app/legal/safety/page.tsx', 'utf8')
    expect(source).toContain('Profile approval does not establish identity or background screening.')
    expect(source).toContain('A credential marked verified refers only to that individual credential.')
    expect(source).not.toMatch(/Every trainer.*has passed|responds within|<li>Annual re-verification/)
  })
})
