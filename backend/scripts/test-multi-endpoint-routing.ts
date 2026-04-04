/**
 * Testing Utilities for Multi-Endpoint Routing
 * 
 * Helper functions to manually test ingress detection and routing
 * without needing actual Twilio calls.
 */

import { 
  detectCallIngress,
  checkLoopGuards,
  resolveIngressAwareEndpoint,
  RoutingContext,
  normalizeE164,
  phonesMatch,
} from '@src/services/ingressAwareRouting';
import logger from 'jet-logger';

/**
 * Manual test: simulate ingress detection for a profile
 * 
 * Usage:
 * node -r dotenv/config -r ts-node/register --eval "
 *   testIngress('profile-uuid', '+15551234567', '+15559876543')
 * "
 */
export async function testIngress(profileId: string, fromNumber: string, forwardedFrom?: string) {
  console.log('\n=== Testing Ingress Detection ===');
  console.log(`Profile: ${profileId}`);
  console.log(`From: ${fromNumber}`);
  console.log(`Forwarded: ${forwardedFrom || 'none'}`);

  const ctx: RoutingContext = {
    profileId,
    callSid: 'TEST-12345',
    toNumber: '+15559999999',  // Dummy Verity number
    fromNumber,
    forwardedFrom,
    timestamp: new Date(),
  };

  const result = await detectCallIngress(ctx);
  
  console.log('\nResult:');
  console.log(`  Type: ${result.ingressType}`);
  console.log(`  Confidence: ${result.ingressConfidence}`);
  console.log(`  ANI Confidence: ${result.aniConfidence}`);
  console.log(`  Details:`, result.details);

  return result;
}

/**
 * Manual test: simulate loop guard checks
 */
export async function testLoopGuard(
  profileId: string,
  fromNumber: string,
  destinationNumber: string,
  toNumber: string
) {
  console.log('\n=== Testing Loop Guards ===');
  console.log(`Profile: ${profileId}`);
  console.log(`From: ${fromNumber}`);
  console.log(`Destination: ${destinationNumber}`);
  console.log(`Verity Number: ${toNumber}`);

  const ctx: RoutingContext = {
    profileId,
    callSid: 'TEST-67890',
    toNumber,
    fromNumber,
    timestamp: new Date(),
  };

  const dummyIngress = {
    ingressType: 'mobile' as const,
    ingressConfidence: 'high' as const,
    ingressFromNumber: fromNumber,
    forwardedFromNumber: null,
    aniConfidence: 'high' as const,
    details: {},
  };

  const result = await checkLoopGuards(ctx, destinationNumber, dummyIngress);

  console.log('\nResult:');
  console.log(`  Allowed: ${result.allowed}`);
  console.log(`  Reason: ${result.reason}`);
  console.log(`  Hop Count: ${result.hopCount}`);
  console.log(`  Details:`, result.details);

  return result;
}

/**
 * Manual test: check endpoint resolution
 */
export async function testEndpointResolution(
  profileId: string,
  ingressType: 'mobile' | 'landline' | 'app' | 'unknown'
) {
  console.log('\n=== Testing Endpoint Resolution ===');
  console.log(`Profile: ${profileId}`);
  console.log(`Ingress Type: ${ingressType}`);

  const dummyIngress = {
    ingressType,
    ingressConfidence: 'high' as const,
    ingressFromNumber: '+15551234567',
    forwardedFromNumber: null,
    aniConfidence: 'high' as const,
    details: {},
  };

  const endpoint = await resolveIngressAwareEndpoint(profileId, dummyIngress);

  console.log('\nResult:');
  console.log(`  Endpoint: ${endpoint || 'none (fallback to legacy)'}`);

  return endpoint;
}

/**
 * Manual test: phone number normalization
 */
export function testPhoneNormalization() {
  console.log('\n=== Testing Phone Number Normalization ===');

  const testNums = [
    '5551234567',
    '+15551234567',
    '(555) 123-4567',
    '+1 555 123 4567',
    '15551234567',
    'invalid',
    '+4435512345678',  // International
  ];

  testNums.forEach((num) => {
    const normalized = normalizeE164(num);
    console.log(`  ${num.padEnd(20)} → ${normalized || 'INVALID'}`);
  });
}

/**
 * Manual test: phone match comparison
 */
export function testPhoneMatching() {
  console.log('\n=== Testing Phone Number Matching ===');

  const pairs = [
    ['+15551234567', '5551234567'],
    ['+1-555-123-4567', '+1 (555) 123-4567'],
    ['+15551234567', '+15559999999'],
    ['(555) 123-4567', '555 123 4567'],
  ];

  pairs.forEach(([phone1, phone2]) => {
    const matches = phonesMatch(phone1, phone2);
    console.log(`  ${phone1} ≈ ${phone2} → ${matches ? 'MATCH' : 'NO MATCH'}`);
  });
}

/**
 * Run all tests in sequence
 */
export async function runAllTests() {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║   Multi-Endpoint Routing - Manual Test Suite          ║');
  console.log('╚════════════════════════════════════════════════════════╝');

  // Test phone utilities
  testPhoneNormalization();
  testPhoneMatching();

  // Test with sample data
  console.log('\n--- Testing with Sample Profile ---');
  console.log('(Using dummy profile - set REAL_PROFILE_ID in env to test actual profile)');

  const testProfileId = process.env.REAL_PROFILE_ID || 'dummy-profile-uuid';

  try {
    // These will work with dummy data
    await testIngress(testProfileId, '+15551234567', '+15551234567');
    await testLoopGuard(testProfileId, '+15551234567', '+15559876543', '+15559999999');
    await testEndpointResolution(testProfileId, 'mobile');
  } catch (err) {
    console.log(`\n⚠️  Sample tests skipped (profile may not exist in DB)`);
    logger.warn((err as Error).message);
  }

  console.log('\n✅ Test suite complete\n');
}

// Export for CLI usage
if (require.main === module) {
  runAllTests().catch(console.error);
}

export default {
  testIngress,
  testLoopGuard,
  testEndpointResolution,
  testPhoneNormalization,
  testPhoneMatching,
  runAllTests,
};
