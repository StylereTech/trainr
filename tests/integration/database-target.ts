export function verifyDatabaseTarget(raw: string | undefined, enabled: string | undefined) {
  if (!raw || enabled !== '1') throw new Error('Set TEST_DATABASE_URL and TRAINR_ALLOW_DB_TESTS=1 for disposable PostgreSQL tests.')
  const url = new URL(raw)
  const allowed = new Set(['schema', 'connection_limit', 'pool_timeout', 'connect_timeout'])
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['localhost', '127.0.0.1'].includes(url.hostname) ||
      decodeURIComponent(url.username) !== 'trainr_test' || !/^\/trainr_audit_[a-z0-9_]+$/.test(url.pathname) ||
      (url.searchParams.get('schema') || 'public') !== 'public' || Array.from(url.searchParams.keys()).some((key) => !allowed.has(key))) {
    throw new Error('Database tests require loopback, user trainr_test, database trainr_audit_*, and the public schema; connection overrides are prohibited.')
  }
  return raw
}
