import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db/client'
import { vehicles, webhookEvents, signals } from '@/db/schema'
import { verifySmartcarSignature } from '@/lib/verifySignature'
import { flattenData } from '@/lib/flatten'
import { eq } from 'drizzle-orm'
import crypto from 'node:crypto'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  console.log('🔔 Webhook received:', {
    method: req.method,
    url: req.url,
    headers: Object.fromEntries(req.headers.entries()),
    timestamp: new Date().toISOString()
  })

  const bodyBuffer = Buffer.from(await req.arrayBuffer())
  const signatureHeader = req.headers.get('SC-Signature')
  const secret = process.env.SMARTCAR_WEBHOOK_SECRET

  console.log('📝 Request details:', {
    bodyLength: bodyBuffer.length,
    hasSignature: !!signatureHeader,
    hasSecret: !!secret,
    contentType: req.headers.get('content-type')
  })

  if (!secret) {
    console.error('❌ SMARTCAR_WEBHOOK_SECRET not configured')
    return NextResponse.json({ error: 'SMARTCAR_WEBHOOK_SECRET not configured' }, { status: 500 })
  }

  let json: any
  try {
    const bodyText = bodyBuffer.toString('utf8')
    console.log('📄 Raw body:', bodyText)
    json = JSON.parse(bodyText)
    console.log('✅ Parsed JSON:', JSON.stringify(json, null, 2))
  } catch (error) {
    console.error('❌ JSON parse error:', error)
    console.error('❌ Raw body that failed to parse:', bodyBuffer.toString('utf8'))
    return NextResponse.json({ 
      error: 'invalid json', 
      details: error instanceof Error ? error.message : 'Unknown parse error',
      rawBody: bodyBuffer.toString('utf8')
    }, { status: 400 })
  }

  // Handle Smartcar webhook verification challenge
  if (json.eventType === 'VERIFY') {
    console.log('🔐 Handling verification challenge')
    const challenge = json.data?.challenge
    if (!challenge) {
      console.error('❌ Missing challenge in verification payload:', json)
      return NextResponse.json({ 
        error: 'Missing challenge in verification payload',
        receivedPayload: json
      }, { status: 400 })
    }

    // Hash the challenge with the secret (HMAC SHA-256)
    const hmac = crypto
      .createHmac('sha256', secret)
      .update(challenge)
      .digest('hex')

    console.log('✅ Verification response:', { challenge: hmac })
    return NextResponse.json({ challenge: hmac })
  }

  // For actual webhook events, verify signature
  console.log('🔍 Verifying signature for webhook event')
  const isValid = verifySmartcarSignature({ bodyBuffer, signatureHeader, secret })
  if (!isValid) {
    console.error('❌ Invalid signature:', {
      providedSignature: signatureHeader,
      bodyLength: bodyBuffer.length
    })
    return NextResponse.json({ ok: false, error: 'invalid signature' }, { status: 401 })
  }

  console.log('✅ Signature verified, processing webhook event')

  const eventName: string = json.eventName
  const vehicleId: string = json.vehicleId
  const eventTimestamp: string = json.timestamp
  const data: Record<string, unknown> = json.data || {}

  console.log('📊 Webhook event details:', {
    eventName,
    vehicleId,
    eventTimestamp,
    dataKeys: Object.keys(data),
    dataSize: JSON.stringify(data).length
  })

  if (!eventName || !vehicleId || !eventTimestamp) {
    console.error('❌ Missing required fields:', {
      hasEventName: !!eventName,
      hasVehicleId: !!vehicleId,
      hasEventTimestamp: !!eventTimestamp,
      receivedPayload: json
    })
    return NextResponse.json({ 
      error: 'missing fields',
      required: ['eventName', 'vehicleId', 'timestamp'],
      received: {
        eventName,
        vehicleId,
        timestamp: eventTimestamp
      }
    }, { status: 400 })
  }

  try {
    // Ensure vehicle exists
    console.log('🚗 Ensuring vehicle exists:', vehicleId)
    const existing = await db.select().from(vehicles).where(eq(vehicles.id, vehicleId)).limit(1)
    if (existing.length === 0) {
      console.log('➕ Creating new vehicle:', vehicleId)
      await db.insert(vehicles).values({ id: vehicleId }).onConflictDoNothing()
    }

    console.log('💾 Storing webhook event')
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

    console.log('✅ Webhook event stored with ID:', eventRow.id)

    const flattened = flattenData(data)
    console.log('📈 Flattened signals:', flattened.length, 'entries')

    if (flattened.length > 0) {
      console.log('💾 Storing signals')
      await db.insert(signals).values(
        flattened.map((entry) => ({
          webhookEventId: eventRow.id,
          vehicleId,
          signalPath: entry.path,
          value: typeof entry.value === 'number' ? String(entry.value) : null,
          unit: entry.unit,
        }))
      )
      console.log('✅ Signals stored successfully')
    }

    console.log('🎉 Webhook processing completed successfully')
    return NextResponse.json({ ok: true, id: eventRow.id })

  } catch (error) {
    console.error('❌ Database error:', error)
    return NextResponse.json({ 
      error: 'Database operation failed',
      details: error instanceof Error ? error.message : 'Unknown database error'
    }, { status: 500 })
  }
}


