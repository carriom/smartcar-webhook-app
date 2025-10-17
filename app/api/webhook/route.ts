import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db/client'
import { vehicles, webhookEvents, signals } from '@/db/schema'
import { verifySmartcarSignature } from '@/lib/verifySignature'
import { flattenData } from '@/lib/flatten'
import { eq } from 'drizzle-orm'
import crypto from 'node:crypto'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const bodyBuffer = Buffer.from(await req.arrayBuffer())
  const signatureHeader = req.headers.get('SC-Signature')
  const secret = process.env.SMARTCAR_WEBHOOK_SECRET

  if (!secret) {
    return NextResponse.json({ error: 'SMARTCAR_WEBHOOK_SECRET not configured' }, { status: 500 })
  }

  let json: any
  try {
    json = JSON.parse(bodyBuffer.toString('utf8'))
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  // Handle Smartcar webhook verification challenge
  if (json.eventType === 'VERIFY') {
    const challenge = json.data?.challenge
    if (!challenge) {
      return NextResponse.json({ error: 'Missing challenge in verification payload' }, { status: 400 })
    }

    // Hash the challenge with the secret (HMAC SHA-256)
    const hmac = crypto
      .createHmac('sha256', secret)
      .update(challenge)
      .digest('hex')

    return NextResponse.json({ challenge: hmac })
  }

  // For actual webhook events, verify signature
  const isValid = verifySmartcarSignature({ bodyBuffer, signatureHeader, secret })
  if (!isValid) {
    // Skip insert if invalid signature
    return NextResponse.json({ ok: false, error: 'invalid signature' }, { status: 401 })
  }

  const eventName: string = json.eventName
  const vehicleId: string = json.vehicleId
  const eventTimestamp: string = json.timestamp
  const data: Record<string, unknown> = json.data || {}

  if (!eventName || !vehicleId || !eventTimestamp) {
    return NextResponse.json({ error: 'missing fields' }, { status: 400 })
  }

  // Ensure vehicle exists
  const existing = await db.select().from(vehicles).where(eq(vehicles.id, vehicleId)).limit(1)
  if (existing.length === 0) {
    await db.insert(vehicles).values({ id: vehicleId }).onConflictDoNothing()
  }

  const [eventRow] = await db
    .insert(webhookEvents)
    .values({
      vehicleId,
      eventName,
      eventTimestamp: new Date(eventTimestamp),
      signatureValid: true,
      rawPayload: json,
    })
    .returning()

  const flattened = flattenData(data)

  if (flattened.length > 0) {
    await db.insert(signals).values(
      flattened.map((entry) => ({
        webhookEventId: eventRow.id,
        vehicleId,
        signalPath: entry.path,
        value: typeof entry.value === 'number' ? String(entry.value) : null,
        unit: entry.unit,
      }))
    )
  }

  return NextResponse.json({ ok: true, id: eventRow.id })
}


