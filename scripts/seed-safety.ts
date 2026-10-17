type SeedEnvironment = Record<string, string | undefined>
type SeedDatabase = {
  $queryRawUnsafe<T = unknown>(query: string): Promise<T>
  $disconnect(): Promise<void>
}

export class SeedSafetyError extends Error {}

export function seedTarget(env: SeedEnvironment) {
  if (env.NODE_ENV === 'production' || env.VERCEL || env.VERCEL_ENV || env.TRAINR_STAGING_INIT) {
    throw new SeedSafetyError('SEED_LOCAL_ONLY')
  }
  let url: URL
  try { url = new URL(env.DATABASE_URL || '') } catch { throw new SeedSafetyError('SEED_TARGET_INVALID') }
  const database = url.pathname.slice(1)
  const allowed = new Set(['schema', 'connection_limit', 'pool_timeout', 'connect_timeout'])
  if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
      !['127.0.0.1', 'localhost'].includes(url.hostname) || url.hash ||
      url.username !== 'trainr_seed' || !/^trainr_seed_[a-z0-9_]+$/.test(database) ||
      (url.searchParams.get('schema') || 'public') !== 'public' ||
      [...url.searchParams.keys()].some(key => !allowed.has(key) || url.searchParams.getAll(key).length !== 1)) {
    throw new SeedSafetyError('SEED_TARGET_INVALID')
  }
  if (env.TRAINR_ALLOW_DESTRUCTIVE_SEED !== database) throw new SeedSafetyError('SEED_EXPLICIT_DATABASE_OPT_IN_REQUIRED')
  return { url: url.href, database }
}

export async function runGuardedSeed<T extends SeedDatabase>(
  env: SeedEnvironment,
  create: (url: string) => T,
  seed: (db: T) => Promise<void>,
) {
  const target = seedTarget(env)
  const db = create(target.url)
  try {
    const identity = await db.$queryRawUnsafe<Array<{ database: string; role: string; schema: string }>>(
      'SELECT current_database() AS database, current_user AS role, current_schema() AS schema',
    )
    if (identity.length !== 1 || identity[0].database !== target.database ||
        identity[0].role !== 'trainr_seed' || identity[0].schema !== 'public') {
      throw new SeedSafetyError('SEED_DATABASE_IDENTITY_MISMATCH')
    }
    const marker = await db.$queryRawUnsafe<Array<{ purpose: string }>>('SELECT purpose FROM public.trainr_seed_guard')
    if (marker.length !== 1 || marker[0].purpose !== 'disposable local demo seed') {
      throw new SeedSafetyError('SEED_OWNERSHIP_REQUIRED')
    }
    await seed(db)
  } finally {
    await db.$disconnect()
  }
}
