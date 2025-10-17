#!/usr/bin/env node

/**
 * Real webhook test using actual Vercel database
 * This simulates the exact payload from Smartcar and tests our fix
 */

const crypto = require('crypto');
const fs = require('fs');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

// Sample Smartcar webhook payload (from your actual log)
const samplePayload = {
  "eventId": "8a79f1a0-c034-4e44-a8b7-eecb8d123908",
  "eventType": "VEHICLE_STATE",
  "data": {
    "user": {
      "id": "ad665721-94b2-488f-807c-2a6ee5a9891e"
    },
    "vehicle": {
      "id": "4f9214c5-2caa-4448-bc1e-2da0bd1e64d3",
      "make": "Tesla",
      "model": "Model 3",
      "year": 2020
    },
    "signals": [
      {
        "code": "charge-amperage",
        "name": "Amperage",
        "group": "Charge",
        "body": {
          "value": 33
        },
        "meta": {
          "oemUpdatedAt": 1760665091694,
          "retrievedAt": 1760665091694
        }
      },
      {
        "code": "charge-ischarging",
        "name": "IsCharging",
        "group": "Charge",
        "body": {
          "value": true
        },
        "meta": {
          "oemUpdatedAt": 1760665091694,
          "retrievedAt": 1760665091694
        }
      },
      {
        "code": "charge-chargelimits",
        "name": "ChargeLimits",
        "group": "Charge",
        "body": {
          "values": {
            "activeLimit": 80,
            "values": [
              {
                "type": "GLOBAL",
                "limit": 80
              },
              {
                "type": "LOCATION",
                "condition": {
                  "name": "Home",
                  "address": "123 2nd street",
                  "latitude": 90,
                  "longitude": 90
                },
                "limit": 72
              }
            ]
          }
        },
        "meta": {
          "oemUpdatedAt": 1760665091694,
          "retrievedAt": 1760665091694
        }
      },
      {
        "code": "closure-doors",
        "name": "Doors",
        "group": "Closure",
        "body": {
          "values": {
            "rowCount": 2,
            "columnCount": 2,
            "doors": [
              {
                "row": 0,
                "column": 0,
                "isOpen": false,
                "isLocked": true
              },
              {
                "row": 0,
                "column": 1,
                "isOpen": false,
                "isLocked": true
              }
            ]
          }
        },
        "meta": {
          "oemUpdatedAt": 1760665091694,
          "retrievedAt": 1760665091694
        }
      },
      // Add some problematic signals to test edge cases
      null, // null signal
      undefined, // undefined signal
      {
        "code": "malformed-signal",
        "name": "MalformedSignal",
        "group": "Test"
        // missing body
      },
      {
        "code": "empty-body-signal",
        "name": "EmptyBodySignal",
        "group": "Test",
        "body": {}
      }
    ]
  },
  "triggers": [
    {
      "type": "SIGNAL_UPDATED",
      "signal": {
        "name": "Amperage",
        "code": "charge-amperage",
        "group": "Charge"
      }
    }
  ],
  "meta": {
    "version": "4.0",
    "webhookId": "cdf56042-22a9-425a-9faf-4bb0d89d1884",
    "webhookName": "Demo App",
    "deliveryId": "43482cdc-68a3-494d-bad3-54f26e9c0965",
    "deliveredAt": "2025-10-17T01:38:11.694Z",
    "mode": "TEST",
    "signalCount": 7
  }
};

async function testWebhook() {
  console.log('🧪 Testing webhook with real Vercel database...\n');
  
  // Check environment
  if (!process.env.POSTGRES_URL) {
    console.error('❌ POSTGRES_URL not found in environment');
    process.exit(1);
  }
  
  if (!process.env.SMARTCAR_WEBHOOK_SECRET) {
    console.error('❌ SMARTCAR_WEBHOOK_SECRET not found in environment');
    process.exit(1);
  }
  
  console.log('✅ Environment variables loaded');
  console.log('📊 Database URL:', process.env.POSTGRES_URL.substring(0, 20) + '...');
  console.log('📊 Webhook secret:', process.env.SMARTCAR_WEBHOOK_SECRET.substring(0, 10) + '...\n');
  
  // Create signature
  const bodyString = JSON.stringify(samplePayload);
  const signature = crypto
    .createHmac('sha256', process.env.SMARTCAR_WEBHOOK_SECRET)
    .update(bodyString)
    .digest('hex');
  
  console.log('🔐 Generated signature:', signature);
  
  // Test the webhook endpoint
  const webhookUrl = 'https://webhook-app-lake.vercel.app/api/webhook';
  
  try {
    console.log('🌐 Sending webhook to:', webhookUrl);
    console.log('📦 Payload size:', bodyString.length, 'bytes');
    console.log('📊 Signals count:', samplePayload.data.signals.length);
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'SC-Signature': signature,
        'User-Agent': 'Smartcar-Webhooks/4.0'
      },
      body: bodyString
    });
    
    const responseText = await response.text();
    let responseJson;
    
    try {
      responseJson = JSON.parse(responseText);
    } catch (e) {
      console.log('📄 Raw response:', responseText);
    }
    
    console.log('\n📊 Response Status:', response.status);
    console.log('📊 Response Headers:', Object.fromEntries(response.headers.entries()));
    
    if (responseJson) {
      console.log('📊 Response Body:', JSON.stringify(responseJson, null, 2));
    }
    
    if (response.ok) {
      console.log('\n✅ Webhook test SUCCESSFUL!');
      console.log('🎉 The fix is working correctly');
    } else {
      console.log('\n❌ Webhook test FAILED');
      console.log('💥 Status:', response.status);
      if (responseJson) {
        console.log('💥 Error:', responseJson.error);
        console.log('💥 Details:', responseJson.details);
      }
    }
    
  } catch (error) {
    console.error('\n❌ Network error:', error.message);
    console.error('💥 Full error:', error);
  }
}

// Run the test
testWebhook().catch(console.error);
