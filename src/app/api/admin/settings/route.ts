import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { defaultFeeValues, FeeEditConflict, feeUpdateSchema, updateFeeConfiguration } from '@/lib/fee-config'

export async function GET(req: NextRequest) {
  try {
    const user = await getRequestUser(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const result = await prisma.$transaction(async (tx) => {
      const configs = await tx.feeConfig.findMany({ orderBy: [{ effectiveDate: 'desc' }, { id: 'desc' }], take: 10 })
      const active = await tx.feeConfig.findFirst({ where: { isActive: true }, orderBy: [{ effectiveDate: 'desc' }, { id: 'desc' }] })
      return { configs, active, defaults: defaultFeeValues }
    }, { isolationLevel: 'RepeatableRead' })
    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: 'Unable to load fee settings.' }, { status: 503 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const parsed = feeUpdateSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
    return NextResponse.json(await updateFeeConfiguration(user.id, parsed.data), { status: 201 })
  } catch (error) {
    if (error instanceof FeeEditConflict) return NextResponse.json({ error: error.message }, { status: 409 })
    return NextResponse.json({ error: 'Unable to save fee settings. Reload before retrying.' }, { status: 503 })
  }
}
