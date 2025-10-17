import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db/client'
import { webhookEvents } from '@/db/schema'
import { and, desc, eq } from 'drizzle-orm'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const vehicleId = searchParams.get('vehicleId')
  const eventName = searchParams.get('eventName')
  const limit = Math.min(Number(searchParams.get('limit') || '50'), 200)

  const where = [] as any[]
  if (vehicleId) where.push(eq(webhookEvents.vehicleId, vehicleId))
  if (eventName) where.push(eq(webhookEvents.eventName, eventName))

  const rows = await db
    .select()
    .from(webhookEvents)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(webhookEvents.receivedAt))
    .limit(limit)

  return NextResponse.json(rows)
}


