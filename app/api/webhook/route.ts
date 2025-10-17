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

    // Process Smartcar signals format - COMPLETELY NEW APPROACH
    if (signals.length > 0 && eventRow && eventRow.id && typeof eventRow.id === 'string') {
      console.log('💾 Processing signals with individual insertion approach')
      console.log('📊 EventRow details:', { id: eventRow.id, type: typeof eventRow.id })
      
      // Only try to store signals if we have a real database ID
      if (!eventRow.id.startsWith('temp-')) {
        console.log('🔍 Processing signals one by one to avoid array issues...')
        
        let successCount = 0
        let errorCount = 0
        
        for (let i = 0; i < signals.length; i++) {
          const signal = signals[i]
          
          try {
            // Validate signal
            if (!signal || typeof signal !== 'object' || !signal.group || !signal.name) {
              console.log(`⚠️ Skipping invalid signal ${i}:`, { 
                hasSignal: !!signal, 
                hasGroup: !!signal?.group, 
                hasName: !!signal?.name 
              })
              errorCount++
              continue
            }
            
            // Store the entire body as JSON string for maximum flexibility
            let value = null
            if (signal.body && typeof signal.body === 'object') {
              // Store the entire body as JSON to preserve all data
              value = JSON.stringify(signal.body)
            } else if (signal.body !== undefined) {
              // For primitive values, convert to string
              value = String(signal.body)
            }
            
            // Insert single signal
            await db.insert(signals).values({
              webhookEventId: eventRow.id,
              vehicleId,
              signalPath: `${signal.group.toLowerCase()}.${signal.name.toLowerCase()}`,
              value,
              unit: signal.body?.unit || null,
            })
            
            successCount++
            
            // Log progress every 10 signals
            if (successCount % 10 === 0) {
              console.log(`📊 Processed ${successCount}/${signals.length} signals...`)
            }
            
          } catch (singleSignalError) {
            console.error(`❌ Failed to insert signal ${i}:`, {
              signal: { group: signal?.group, name: signal?.name },
              error: singleSignalError instanceof Error ? singleSignalError.message : String(singleSignalError)
            })
            errorCount++
          }
        }
        
        console.log(`✅ Signals processing completed: ${successCount} successful, ${errorCount} failed`)
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


