import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const startTime = Date.now()

export async function GET() {
  let dbConnected = false

  try {
    await prisma.$queryRaw`SELECT 1`
    dbConnected = true
  } catch {
    // DB not reachable
  }

  return NextResponse.json({
    ok: dbConnected,
    timestamp: new Date().toISOString(),
    uptimeMs: Date.now() - startTime,
    dbConnected,
  }, { status: dbConnected ? 200 : 503 })
}
