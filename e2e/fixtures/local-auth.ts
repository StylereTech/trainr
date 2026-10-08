import { randomUUID } from 'node:crypto'
import { test as base, expect } from '@playwright/test'
import { PrismaClient, type Role, type User } from '@prisma/client'
import { hash } from 'bcryptjs'
import { encode } from 'next-auth/jwt'
import { verifyDatabaseTarget } from '../../tests/integration/database-target'

type LocalAuth = { database: PrismaClient; password: string; create: (role: Role) => Promise<User>; signIn: (user: User) => Promise<string> }

export const test = base.extend<{ localAuth: LocalAuth }>({
  localAuth: async ({ context }, use) => {
    const origin = process.env.BASE_URL || ''
    const secret = process.env.LOCAL_E2E_SECRET || ''
    if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin) || !secret) throw new Error('Local auth fixtures require loopback and a local-only secret.')
    const url = verifyDatabaseTarget(process.env.TEST_DATABASE_URL, process.env.TRAINR_ALLOW_DB_TESTS)
    const database = new PrismaClient({ datasourceUrl: url })
    const ids: string[] = []
    const password = `Local-only-${randomUUID()}`
    try {
      const marker = await database.$queryRaw<Array<{ purpose: string }>>`SELECT purpose FROM trainr_test_guard`
      if (marker.length !== 1 || marker[0].purpose !== 'disposable integration database') throw new Error('Missing disposable database marker.')
      const passwordHash = await hash(password, 4)
      await use({ database, password,
        create: async role => {
          const id = randomUUID()
          const user = await database.user.create({ data: { email: `browser-${id}@example.test`, role, passwordHash,
            ...(role === 'PARENT' ? { parentProfile: { create: {} } } : {}),
            ...(role === 'TRAINER' ? { trainerProfile: { create: { firstName: 'Synthetic', lastName: 'Trainer', slug: `browser-${id}` } } } : {}),
          } })
          ids.push(user.id)
          return user
        },
        signIn: async user => {
          const token = await encode({ secret, token: { sub: user.id, role: user.role, email: user.email, sessionVersion: user.sessionVersion } })
          await context.addCookies([{ name: 'next-auth.session-token', value: token, url: origin }])
          return token
        },
      })
    } finally {
      if (ids.length) {
        await database.adminAction.deleteMany({ where: { adminUserId: { in: ids } } })
        await database.user.deleteMany({ where: { id: { in: ids } } })
      }
      await database.$disconnect()
    }
  },
})
export { expect }
