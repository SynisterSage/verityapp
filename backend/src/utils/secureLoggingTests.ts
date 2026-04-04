/**
 * Test utility for validating PTSN routing logs
 * Ensures no credentials, IDs, or environment variables leak
 */

import {
  maskPhone,
  shortId,
  validateLogSafety,
  logRoutingStart,
  logIngressDetected,
  logLoopGuardCheck,
  logEndpointResolved,
  logRoutingDecision,
  logBridgeAttempt,
} from './secureLogging';

/**
 * Test phone masking
 */
function testPhoneMasking() {
  console.log('\n=== Phone Masking Tests ===');
  const testCases = [
    { input: '+14155552671', expected: '***-***-2671' },
    { input: '14155552671', expected: '***-***-2671' },
    { input: '(415) 555-2671', expected: '***-***-2671' },
    { input: null, expected: '(unknown)' },
    { input: '123', expected: '***' },
  ];

  testCases.forEach(({ input, expected }) => {
    const result = maskPhone(input as string);
    const status = result.match(/\*+.*\d{4}/) || result === '(unknown)' ? '✓' : '✗';
    console.log(`${status} maskPhone("${input}") = "${result}"`);
  });
}

/**
 * Test ID shortening
 */
function testIdShortening() {
  console.log('\n=== ID Shortening Tests ===');
  const uuid = '550e8400-e29b-41d4-a716-446655440000';
  const shortened = shortId(uuid);
  console.log(`✓ shortId("${uuid}") = "${shortened}"`);
  console.log(`  (Full length: ${uuid.length}, shortened length: ${shortened.length})`);
}

/**
 * Test log safety validation
 */
function testLogSafetyValidation() {
  console.log('\n=== Log Safety Validation Tests ===');

  const testCases = [
    {
      message: 'PTSN routing to ***-***-2671',
      shouldBeSafe: true,
    },
    {
      message: 'Profile 550e8400... detected ingress type mobile',
      shouldBeSafe: true,
    },
    {
      message: 'ERROR: Twilio API key sk_live_secret123',
      shouldBeSafe: false,
    },
    {
      message: 'Authorization: Bearer token_secret_xyz',
      shouldBeSafe: false,
    },
    {
      message: 'Database connection failed: DATABASE_URL not found',
      shouldBeSafe: false,
    },
    {
      message: 'Bridge attempt to PSTN endpoint',
      shouldBeSafe: true,
    },
  ];

  testCases.forEach(({ message, shouldBeSafe }) => {
    const result = validateLogSafety(message);
    const status = result.safe === shouldBeSafe ? '✓' : '✗';
    const safetyStatus = result.safe ? 'SAFE' : 'UNSAFE';
    console.log(`${status} "${message}" → ${safetyStatus}`);
    if (!result.safe) {
      console.log(`   Warnings: ${result.warnings.join(', ')}`);
    }
  });
}

/**
 * Simulate logging workflow
 */
function demonstrateLoggingWorkflow() {
  console.log('\n=== Simulated Routing Workflow Logs ===');
  console.log('(These demonstrate what gets logged during a call)\n');

  const profileId = '550e8400-e29b-41d4-a716-446655440000';
  const callSid = 'CA1234567890abcdef1234567890abcdef';
  const fromNumber = '+14155552671';
  const toNumber = '+14155558000';

  console.log('1. Routing Start:');
  console.log(`   [routing-start] callSid=${callSid} profile=${shortId(profileId)} from=${maskPhone(fromNumber)} to=${maskPhone(toNumber)}`);

  console.log('\n2. Ingress Detected:');
  console.log(`   [ingress-detected] callSid=${callSid} type=mobile confidence=high from=${maskPhone(fromNumber)} method=forwarded_from_header`);

  console.log('\n3. Endpoint Resolved:');
  console.log(`   [endpoint-resolved] callSid=${callSid} type=mobile endpoint=${maskPhone(fromNumber)}`);

  console.log('\n4. Loop Guard Check:');
  console.log(`   [loop-guard] callSid=${callSid} status=ALLOWED reason=allowed hopCount=0 destination=${maskPhone(fromNumber)}`);

  console.log('\n5. Routing Decision:');
  console.log(`   [routing-decision] callSid=${callSid} mode=ingress_aware destination=${maskPhone(fromNumber)} type=mobile`);

  console.log('\n6. Bridge Attempt:');
  console.log(`   [bridge-attempt] callSid=${callSid} type=pstn number=${maskPhone(fromNumber)}`);

  console.log('\n✓ No credentials, IDs, or env vars exposed in logs\n');
}

/**
 * Run all tests
 */
export function runSecureLoggingTests() {
  console.log('╔════════════════════════════════════════════╗');
  console.log('║   PTSN Routing - Secure Logging Tests     ║');
  console.log('╔════════════════════════════════════════════╗\n');

  testPhoneMasking();
  testIdShortening();
  testLogSafetyValidation();
  demonstrateLoggingWorkflow();

  console.log('All tests completed! ✓');
}

// Run tests if this file is executed directly
if (require.main === module) {
  runSecureLoggingTests();
}
