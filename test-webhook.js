#!/usr/bin/env node

/**
 * Local webhook testing script
 * Run with: node test-webhook.js
 */

const crypto = require('crypto');
const fs = require('fs');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

// Sample Smartcar webhook payload (from your log)
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
      // Add a malformed signal to test filtering
      {
        "code": "malformed-signal",
        "name": "MalformedSignal",
        "group": "Test",
        "body": null
      },
      // Add another valid signal
      {
        "code": "tractionbattery-stateofcharge",
        "name": "StateOfCharge",
        "group": "TractionBattery",
        "body": {
          "value": 78
        },
        "meta": {
          "oemUpdatedAt": 1760665091694,
          "retrievedAt": 1760665091694
        }
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
    "signalCount": 3
  }
};

async function testWebhook() {
  const payload = JSON.stringify(samplePayload);
  const secret = process.env.SMARTCAR_WEBHOOK_SECRET;
  
  if (!secret) {
    console.error('❌ SMARTCAR_WEBHOOK_SECRET not found in .env.local');
    process.exit(1);
  }

  // Generate signature
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  console.log('🧪 Testing webhook locally...');
  console.log('📝 Payload size:', payload.length, 'bytes');
  console.log('🔐 Generated signature:', signature);

  try {
    const response = await fetch('http://localhost:3000/api/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'SC-Signature': signature,
      },
      body: payload,
    });

    const result = await response.text();
    console.log('📊 Response status:', response.status);
    console.log('📊 Response body:', result);

    if (response.ok) {
      console.log('✅ Webhook test successful!');
    } else {
      console.log('❌ Webhook test failed');
    }
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('💡 Make sure to run: npm run dev');
  }
}

// Test signal filtering logic
function testSignalFiltering() {
  console.log('\n🧪 Testing signal filtering logic...');
  
  const testSignals = [
    // Valid signal
    {
      group: "Charge",
      name: "Amperage",
      body: { value: 33 }
    },
    // Invalid signal - missing group
    {
      name: "InvalidSignal",
      body: { value: 100 }
    },
    // Invalid signal - null body
    {
      group: "Test",
      name: "NullBody",
      body: null
    },
    // Valid signal
    {
      group: "Battery",
      name: "StateOfCharge",
      body: { value: 78, unit: "%" }
    }
  ];

  const filteredSignals = testSignals.filter((signal) => {
    return signal && 
           typeof signal === 'object' && 
           signal.group && 
           signal.name && 
           signal.body !== undefined
  });

  console.log('📊 Original signals:', testSignals.length);
  console.log('📊 Filtered signals:', filteredSignals.length);
  console.log('📊 Valid signals:', filteredSignals.map(s => `${s.group}.${s.name}`));
}

// Run tests
testSignalFiltering();
testWebhook();
