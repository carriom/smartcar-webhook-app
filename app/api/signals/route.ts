import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db/client'
import { signals } from '@/db/schema'
import { and, asc, eq } from 'drizzle-orm'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const vehicleId = searchParams.get('vehicleId')
  const signalPath = searchParams.get('signalPath')
  const limit = Math.min(Number(searchParams.get('limit') || '200'), 1000)

  if (!vehicleId || !signalPath) {
    return NextResponse.json({ error: 'vehicleId and signalPath are required' }, { status: 400 })
  }

  const rows = await db
    .select()
    .from(signals)
    .where(and(eq(signals.vehicleId, vehicleId), eq(signals.signalPath, signalPath)))
    .orderBy(asc(signals.recordedAt))
    .limit(limit)

  return NextResponse.json(rows)
}


