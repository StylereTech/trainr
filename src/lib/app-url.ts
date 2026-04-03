const localhostFallback = 'http://localhost:3000'

function normalizeUrl(value?: string | null) {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null

  try {
    return new URL(trimmed).toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

function normalizeHostLike(value?: string | null) {
  if (!value) return null
  const trimmed = value.trim().replace(/^https?:\/\//, '').replace(/\/$/, '')
  if (!trimmed) return null
  return normalizeUrl(`https://${trimmed}`)
}

export function getAppBaseUrl() {
  return (
    normalizeUrl(process.env.NEXT_PUBLIC_APP_URL) ||
    normalizeUrl(process.env.NEXTAUTH_URL) ||
    normalizeHostLike(process.env.RAILWAY_PUBLIC_DOMAIN) ||
    normalizeUrl(process.env.RAILWAY_STATIC_URL) ||
    normalizeHostLike(process.env.VERCEL_URL) ||
    localhostFallback
  )
}

export function toAbsoluteAppUrl(path: string) {
  return new URL(path, `${getAppBaseUrl()}/`).toString()
}
