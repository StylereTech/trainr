import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const startTime = Date.now()

export async function GET() {
  let dbConnected = false

  let dbError = ''
  try {
    await prisma.$queryRaw`SELECT 1`
    dbConnected = true
  } catch (err: any) {
    dbError = err?.message?.substring(0, 200) || 'unknown error'
  }

  return NextResponse.json({
    ok: dbConnected,
    timestamp: new Date().toISOString(),
    uptimeMs: Date.now() - startTime,
    dbConnected,
    ...(dbError ? { dbError } : {}),
    dbUrl: (process.env.DATABASE_URL || '').substring(0, 40) + '...',
  }, { status: dbConnected ? 200 : 503 })
}
