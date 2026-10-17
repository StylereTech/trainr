import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getRequestUser } from '@/lib/auth'
import { AthleteError, changeAthlete, deleteAthleteSchema, updateAthleteSchema } from '@/lib/athlete-profiles'

async function mutate(req: NextRequest, params: Promise<{ id: string }>, remove: boolean) {
  try {
    const user = await getRequestUser(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (user.role !== 'PARENT') return NextResponse.json({ error: 'Parent access is required' }, { status: 403 })
    const { id } = await params
    const input = (remove ? deleteAthleteSchema : updateAthleteSchema).parse(await req.json())
    return NextResponse.json(await changeAthlete(user.id, id, input, remove), { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.errors[0].message }, { status: 400 })
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    if (error instanceof AthleteError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: 'Change could not be confirmed. Reload the athlete before another action.' }, { status: 503 })
  }
}
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) { return mutate(req, params, false) }
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) { return mutate(req, params, true) }
