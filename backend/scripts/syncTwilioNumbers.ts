/**
 * Sync Script: Import Twilio Numbers to Pool
 * 
 * This script fetches all your Twilio numbers and imports them into the database pool.
 * Numbers already in the pool are skipped.
 * 
 * Usage:
 *   npm run sync-twilio-numbers
 * 
 * What it does:
 *   1. Fetches all incoming phone numbers from your Twilio account
 *   2. Checks which ones are already in the database pool
 *   3. Imports new numbers with status='available'
 *   4. Updates existing numbers if their metadata changed
 */

import 'dotenv/config';
import twilio from 'twilio';
import supabaseAdmin from '../src/services/supabase';
import logger from 'jet-logger';

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

function extractAreaCode(phoneNumber: string): string | null {
  // Remove all non-numeric characters
  const digits = phoneNumber.replace(/\D/g, '');
  
  // For US numbers: +1 (XXX) XXX-XXXX -> area code is positions 1-3
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.slice(1, 4);
  }
  
  // For 10-digit US numbers
  if (digits.length === 10) {
    return digits.slice(0, 3);
  }
  
  return null;
}

async function syncTwilioNumbers() {
  console.log('🔄 Fetching numbers from Twilio...\n');

  try {
    // Fetch all incoming phone numbers from Twilio
    const twilioNumbers = await twilioClient.incomingPhoneNumbers.list();
    
    if (twilioNumbers.length === 0) {
      console.log('⚠️  No numbers found in your Twilio account');
      return;
    }

    console.log(`Found ${twilioNumbers.length} number(s) in Twilio account\n`);

    // Fetch existing numbers from our pool
    const { data: existingNumbers, error: fetchError } = await supabaseAdmin
      .from('twilio_number_pool')
      .select('twilio_sid, phone_number, status');

    if (fetchError) {
      console.error('❌ Failed to fetch existing numbers:', fetchError.message);
      process.exit(1);
    }

    const existingSids = new Set(
      existingNumbers?.map((n) => n.twilio_sid) || []
    );

    // Find numbers already assigned to profiles
    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('twilio_virtual_number')
      .not('twilio_virtual_number', 'is', null);

    const assignedNumbers = new Set(
      profiles?.map((p) => p.twilio_virtual_number) || []
    );

    let imported = 0;
    let skipped = 0;
    let updated = 0;

    // Process each Twilio number
    for (const twilioNum of twilioNumbers) {
      const isAlreadyInPool = existingSids.has(twilioNum.sid);
      const isAssignedToProfile = assignedNumbers.has(twilioNum.phoneNumber);

      if (isAlreadyInPool) {
        console.log(`⏭️  ${twilioNum.phoneNumber} - Already in pool`);
        skipped++;
        continue;
      }

      // Determine initial status
      const initialStatus = isAssignedToProfile ? 'assigned' : 'available';

      // Get profile ID if assigned
      let assignedProfileId: string | null = null;
      if (isAssignedToProfile) {
        const { data: profileMatch } = await supabaseAdmin
          .from('profiles')
          .select('id')
          .eq('twilio_virtual_number', twilioNum.phoneNumber)
          .maybeSingle();
        
        assignedProfileId = profileMatch?.id || null;
      }

      // Import to pool
      const { error: insertError } = await supabaseAdmin
        .from('twilio_number_pool')
        .insert({
          phone_number: twilioNum.phoneNumber,
          twilio_sid: twilioNum.sid,
          status: initialStatus,
          assigned_to_profile_id: assignedProfileId,
          assigned_at: isAssignedToProfile ? new Date().toISOString() : null,
          country_code: twilioNum.addressRequirements || 'US',
          area_code: extractAreaCode(twilioNum.phoneNumber),
          capabilities: {
            voice: twilioNum.capabilities.voice ?? false,
            sms: twilioNum.capabilities.sms ?? false,
            mms: twilioNum.capabilities.mms ?? false,
          },
        });

      if (insertError) {
        console.error(`❌ Failed to import ${twilioNum.phoneNumber}:`, insertError.message);
        continue;
      }

      const statusLabel = initialStatus === 'assigned' ? '(assigned to profile)' : '(available)';
      console.log(`✅ ${twilioNum.phoneNumber} - Imported ${statusLabel}`);
      imported++;
    }

    // Summary
    console.log('\n─────────────────────────────────────');
    console.log('📊 Sync Summary:');
    console.log(`   Total in Twilio: ${twilioNumbers.length}`);
    console.log(`   ✅ Imported:     ${imported}`);
    console.log(`   ⏭️  Skipped:      ${skipped}`);
    console.log('─────────────────────────────────────\n');

    // Show pool stats
    const { data: poolStats } = await supabaseAdmin
      .from('twilio_number_pool')
      .select('status');

    if (poolStats) {
      const stats = poolStats.reduce(
        (acc, row) => {
          acc.total++;
          if (row.status === 'available') acc.available++;
          if (row.status === 'assigned') acc.assigned++;
          return acc;
        },
        { available: 0, assigned: 0, total: 0 }
      );

      console.log('📈 Current Pool Status:');
      console.log(`   Available:  ${stats.available}`);
      console.log(`   Assigned:   ${stats.assigned}`);
      console.log(`   Total:      ${stats.total}\n`);
    }

    console.log('✨ Sync complete!\n');
  } catch (err) {
    console.error('❌ Sync failed:', err);
    logger.err(err as Error);
    process.exit(1);
  }
}

// Run the sync
syncTwilioNumbers()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
