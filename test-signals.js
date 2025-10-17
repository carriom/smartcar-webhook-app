#!/usr/bin/env node

/**
 * Test signal filtering logic without starting the server
 */

// Simulate the signal filtering logic from the webhook
function testSignalProcessing() {
  console.log('🧪 Testing signal processing logic...\n');

  // Sample signals from the actual webhook payload
  const signals = [
    {
      "code": "charge-amperage",
      "name": "Amperage",
      "group": "Charge",
      "body": {
        "value": 33
      }
    },
    {
      "code": "charge-ischarging",
      "name": "IsCharging", 
      "group": "Charge",
      "body": {
        "value": true
      }
    },
    // Add some problematic signals
    null, // null signal
    undefined, // undefined signal
    {
      "code": "malformed-signal",
      "name": "MalformedSignal",
      "group": "Test"
      // missing body
    },
    {
      "code": "another-malformed",
      "name": "AnotherMalformed",
      "group": "Test",
      "body": null
    },
    {
      "code": "valid-signal",
      "name": "ValidSignal",
      "group": "Battery",
      "body": {
        "value": 78,
        "unit": "%"
      }
    }
  ];

  console.log('📊 Original signals count:', signals.length);
  console.log('📊 Sample signals:', signals.slice(0, 3));

  // Apply the same filtering logic as in the webhook
  const signalEntries = signals
    .filter((signal) => {
      // Ensure signal has required properties
      return signal && 
             typeof signal === 'object' && 
             signal.group && 
             signal.name && 
             signal.body !== undefined
    })
    .map((signal) => ({
      webhookEventId: 'test-event-id',
      vehicleId: 'test-vehicle-id',
      signalPath: `${signal.group.toLowerCase()}.${signal.name.toLowerCase()}`,
      value: signal.body?.value !== undefined ? String(signal.body.value) : null,
      unit: signal.body?.unit || null,
    }));

  console.log('\n📊 Filtered signals count:', signalEntries.length);
  console.log('📊 Valid signal entries:');
  signalEntries.forEach((entry, index) => {
    console.log(`  ${index + 1}. ${entry.signalPath} = ${entry.value} ${entry.unit || ''}`);
  });

  // Test edge cases
  console.log('\n🧪 Testing edge cases...');
  
  // Test with empty array
  const emptyResult = [].filter((signal) => {
    return signal && 
           typeof signal === 'object' && 
           signal.group && 
           signal.name && 
           signal.body !== undefined
  });
  console.log('📊 Empty array result:', emptyResult.length);

  // Test with all invalid signals
  const allInvalid = [null, undefined, {}, { group: 'Test' }].filter((signal) => {
    return signal && 
           typeof signal === 'object' && 
           signal.group && 
           signal.name && 
           signal.body !== undefined
  });
  console.log('📊 All invalid signals result:', allInvalid.length);

  console.log('\n✅ Signal processing test completed!');
}

testSignalProcessing();
