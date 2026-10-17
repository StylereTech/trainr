import { expect, it } from 'vitest'
import { verifyDatabaseTarget } from './integration/database-target'

const safe = 'postgresql://trainr_test@127.0.0.1:55439/trainr_audit_20261008'
it('permits an explicitly authorized local disposable database', () => {
  expect(verifyDatabaseTarget(safe, '1')).toBe(safe)
})
it.each([undefined, '', '0', 'true'])('requires explicit test authorization: %s', (enabled) => {
  expect(() => verifyDatabaseTarget(safe, enabled)).toThrow()
})
it.each([
  undefined, '', 'not-a-url', safe.replace('127.0.0.1', 'db.example.com'), safe.replace('trainr_audit_20261008', 'production'),
  safe.replace('trainr_test@', 'postgres@'), `${safe}?host=remote.example.com`, `${safe}?schema=customer`,
  safe.replace('postgresql:', 'https:'), `${safe}?schema=public&host=/tmp`,
])('rejects unsafe database target %s', (url) => {
  expect(() => verifyDatabaseTarget(url, '1')).toThrow()
})
