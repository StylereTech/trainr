import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getRequestUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { AthleteError, athleteFields, createAthlete, createAthleteSchema } from '@/lib/athlete-profiles'

export async function GET(req: NextRequest) {
  try {
    const user = await getRequestUser(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (user.role !== 'PARENT') return NextResponse.json({ error: 'Parent access is required' }, { status: 403 })
    const athletes = await prisma.athleteProfile.findMany({ where: { parentProfile: { userId: user.id, user: { role: 'PARENT', deletedAt: null } } }, select: athleteFields, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] })
    const catalog = await prisma.sport.findMany({ where: { isActive: true }, select: { id: true, slug: true, name: true, isActive: true }, orderBy: [{ order: 'asc' }, { id: 'asc' }] })
    return NextResponse.json({ athletes, catalog }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch { return NextResponse.json({ error: 'Athletes are unavailable. Try again later.' }, { status: 503 }) }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (user.role !== 'PARENT') return NextResponse.json({ error: 'Parent access is required' }, { status: 403 })
    const result = await createAthlete(user.id, createAthleteSchema.parse(await req.json()))
    return NextResponse.json(result.athlete, { status: result.created ? 201 : 200, headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.errors[0].message }, { status: 400 })
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    if (error instanceof AthleteError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: 'Save could not be confirmed. Retry the same save request.' }, { status: 503 })
  }
}
