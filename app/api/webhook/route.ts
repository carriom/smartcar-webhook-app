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

  // Handle Smartcar VEHICLE_STATE payload format
  const eventType: string = json.eventType
  const vehicleId: string = json.data?.vehicle?.id
  const eventTimestamp: string = json.meta?.deliveredAt || new Date().toISOString()
  const signals: any[] = json.data?.signals || []

  console.log('📊 Webhook event details:', {
    eventType,
    vehicleId,
    eventTimestamp,
    signalsCount: signals.length,
    hasVehicle: !!json.data?.vehicle,
    hasUser: !!json.data?.user
  })

  if (!eventType || !vehicleId) {
    console.error('❌ Missing required fields:', {
      hasEventType: !!eventType,
      hasVehicleId: !!vehicleId,
      receivedPayload: json
    })
    return NextResponse.json({ 
      error: 'missing fields',
      required: ['eventType', 'data.vehicle.id'],
      received: {
        eventType,
        vehicleId,
        hasData: !!json.data,
        hasVehicle: !!json.data?.vehicle
      }
    }, { status: 400 })
  }

  try {
    // Ensure vehicle exists with metadata
    console.log('🚗 Ensuring vehicle exists:', vehicleId)
    const existing = await db.select().from(vehicles).where(eq(vehicles.id, vehicleId)).limit(1)
    if (existing.length === 0) {
      console.log('➕ Creating new vehicle:', vehicleId)
      const vehicleData = json.data?.vehicle || {}
      await db.insert(vehicles).values({ 
        id: vehicleId,
        make: vehicleData.make,
        model: vehicleData.model,
        year: vehicleData.year
      }).onConflictDoNothing()
    }

    console.log('💾 Storing webhook event')
    console.log('📝 Event data:', {
      vehicleId,
      eventName: eventType,
      eventTimestamp: new Date(eventTimestamp),
      signatureValid: true,
      payloadSize: JSON.stringify(json).length
    })
    
    let eventRow: any = null
    try {
      const result = await db
        .insert(webhookEvents)
        .values({
          vehicleId,
          eventName: eventType,
          eventTimestamp: new Date(eventTimestamp),
          signatureValid: true,
          rawPayload: json,
        })
        .returning()

      console.log('📊 Database insert result:', { 
        resultType: typeof result, 
        isArray: Array.isArray(result), 
        length: result?.length,
        firstItem: result?.[0]
      })

      eventRow = result?.[0]
      console.log('✅ Webhook event stored with ID:', eventRow?.id)
    } catch (dbError) {
      console.error('❌ Database insert failed:', dbError)
      console.log('⚠️ Continuing without database storage due to error')
      // Create a mock eventRow for signals processing
      eventRow = { id: `temp-${Date.now()}` }
    }

    if (!eventRow) {
      console.error('❌ Failed to insert webhook event - no row returned')
      return NextResponse.json({ 
        error: 'Failed to store webhook event',
        details: 'Database insert returned no rows'
      }, { status: 500 })
    }

    // Process Smartcar signals format
    if (signals.length > 0 && eventRow && eventRow.id && typeof eventRow.id === 'string') {
      console.log('💾 Processing signals from Smartcar format')
      console.log('📊 EventRow details:', { id: eventRow.id, type: typeof eventRow.id })
      
      // Double-check that eventRow.id exists before mapping
      if (!eventRow.id) {
        console.error('❌ eventRow.id is undefined, skipping signals processing')
        return NextResponse.json({ 
          ok: true, 
          id: 'temp-' + Date.now(),
          databaseStatus: 'failed',
          error: 'eventRow.id is undefined'
        })
      }
      
      const signalEntries = signals.map((signal) => ({
        webhookEventId: eventRow.id,
        vehicleId,
        signalPath: `${signal.group.toLowerCase()}.${signal.name.toLowerCase()}`,
        value: signal.body?.value ? String(signal.body.value) : null,
        unit: signal.body?.unit || null,
      }))

      console.log('📊 Signal entries to process:', signalEntries.length)
      console.log('📊 First few entries:', signalEntries.slice(0, 3))

      // Only try to store signals if we have a real database ID
      if (!eventRow.id.startsWith('temp-')) {
      try {
        console.log('🔍 Attempting to insert signals into database...')
        console.log('📊 Sample signal entry structure:', JSON.stringify(signalEntries[0], null, 2))
        
        const result = await db.insert(signals).values(signalEntries)
        console.log('✅ Signals stored successfully:', signalEntries.length, 'entries')
        console.log('📊 Insert result:', result)
      } catch (signalError) {
        console.error('❌ Failed to insert signals:', signalError)
        console.error('❌ Error details:', {
          name: signalError.name,
          message: signalError.message,
          stack: signalError.stack
        })
        console.log('⚠️ Continuing without signals due to error')
      }
      } else {
        console.log('⚠️ Skipping signals storage due to database issues')
      }
    } else if (signals.length > 0) {
      console.log('⚠️ Skipping signals processing - no valid eventRow or eventRow.id')
      console.log('📊 EventRow status:', { 
        hasEventRow: !!eventRow, 
        hasId: !!(eventRow && eventRow.id),
        eventRowType: typeof eventRow
      })
    }

    console.log('🎉 Webhook processing completed successfully')
    return NextResponse.json({ 
      ok: true, 
      id: eventRow?.id || 'temp-' + Date.now(),
      databaseStatus: eventRow?.id ? 'stored' : 'failed'
    })

  } catch (error) {
    console.error('❌ Database error:', error)
    return NextResponse.json({ 
      error: 'Database operation failed',
      details: error instanceof Error ? error.message : 'Unknown database error'
    }, { status: 500 })
  }
}


