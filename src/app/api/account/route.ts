import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { closeAccount } from '@/lib/account-closure'

export async function DELETE(req: NextRequest) {
  try {
    const requestUser = await getRequestUser(req)
    if (!requestUser?.id) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    const allowed = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${requestUser.id} FOR UPDATE`
      const user = await tx.user.findUnique({ where: { id: requestUser.id }, select: { role: true, deletedAt: true } })
      if (!user || user.deletedAt) return true
      if (user.role === 'ADMIN') return false
      await closeAccount(tx, requestUser.id)
      return true
    })
    if (!allowed) return NextResponse.json({ error: 'Admin accounts must be transferred before deletion.' }, { status: 403 })
    return NextResponse.json({ success: true, deleted: true })
  } catch {
    console.error('Account deletion transaction failed')
    return NextResponse.json({ error: 'Unable to delete account. Please try again.' }, { status: 503 })
  }
}
