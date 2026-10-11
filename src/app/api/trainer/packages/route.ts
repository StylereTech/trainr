import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getRequestUser } from '@/lib/auth'
import { PackageEditError, readTrainerPackages, saveTrainerPackage } from '@/lib/trainer-packages'

export const dynamic = 'force-dynamic'
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
const failure = (error: unknown) => error instanceof PackageEditError ? json({ error: error.message }, error.status) :
  error instanceof z.ZodError ? json({ error: error.issues[0].message }, 400) : json({ error: 'Unable to update package data. Reload before retrying.' }, 503)
export async function GET(request: NextRequest) {
  try {
    const actor = await getRequestUser(request)
    if (!actor) return json({ error: 'Unauthorized' }, 401)
    if (actor.role !== 'TRAINER') return json({ error: 'Trainer account required' }, 403)
    const page = z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(10000)).parse(request.nextUrl.searchParams.get('page') || '1')
    return json(await readTrainerPackages(actor.id, page))
  } catch (error) { return failure(error) }
}
export async function PUT(request: NextRequest) {
  try {
    const actor = await getRequestUser(request)
    if (!actor) return json({ error: 'Unauthorized' }, 401)
    if (actor.role !== 'TRAINER') return json({ error: 'Trainer account required' }, 403)
    return json({ package: await saveTrainerPackage(actor.id, await request.json().catch(() => null)) })
  } catch (error) { return failure(error) }
}
