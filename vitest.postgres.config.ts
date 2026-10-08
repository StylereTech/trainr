import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import { verifyDatabaseTarget } from './tests/integration/database-target'

process.env.DATABASE_URL = verifyDatabaseTarget(process.env.TEST_DATABASE_URL, process.env.TRAINR_ALLOW_DB_TESTS)

export default defineConfig({
  test: { environment: 'node', include: ['tests/integration/**/*.integration.ts'], fileParallelism: false, maxWorkers: 1,
    testTimeout: 30000, hookTimeout: 30000 },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
})
