import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import supabaseAdmin from '@src/services/supabase';
import { notifyAllDevicesForAppUpdate } from '@src/services/pushNotifications';

const rl = readline.createInterface({ input, output });

async function ask(question: string): Promise<string> {
  const answer = await rl.question(question);
  return answer.trim();
}

function parseYesNo(value: string, fallback: boolean): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return fallback;
  return ['y', 'yes', 'true', '1'].includes(normalized);
}

async function run() {
  const platformAnswer = await ask('Platform (ios/android) [ios]: ');
  const platform = platformAnswer.toLowerCase() === 'android' ? 'android' : 'ios';

  const { data: existingRow, error: existingError } = await supabaseAdmin
    .from('app_versions')
    .select('latest_version')
    .eq('platform', platform)
    .maybeSingle();
  if (existingError) {
    console.error('Failed to load existing version row:', existingError.message);
    process.exit(1);
  }

  const latestVersion = await ask('Latest version (e.g. 1.1.0): ');
  if (!latestVersion) {
    console.error('Latest version is required.');
    process.exit(1);
  }

  const minSupportedVersion = await ask('Min supported version (blank for none): ');
  const softPrompt = parseYesNo(await ask('Soft prompt enabled? [Y/n]: '), true);
  const hardBlock = parseYesNo(await ask('Hard block enabled? [y/N]: '), false);
  const updateMessage = await ask('Update message (blank for default): ');
  const storeUrl = await ask('Store URL (blank to keep current): ');
  const sendPush = parseYesNo(
    await ask('Send release push if latest version changes? [Y/n]: '),
    true
  );
  const defaultPushTitle = 'Update available';
  const defaultPushBody = `Version ${latestVersion} is ready. Update for the latest fixes.`;
  const pushTitle = sendPush
    ? (await ask(`Push title [${defaultPushTitle}]: `)) || defaultPushTitle
    : null;
  const pushBody = sendPush
    ? (await ask(`Push body [${defaultPushBody}]: `)) || defaultPushBody
    : null;

  console.log('\nPreview:');
  console.log({
    platform,
    latest_version: latestVersion,
    min_supported_version: minSupportedVersion || null,
    soft_prompt_enabled: softPrompt,
    hard_block_enabled: hardBlock,
    update_message: updateMessage || null,
    store_url: storeUrl || null,
    send_push: sendPush,
    push_title: pushTitle,
    push_body: pushBody,
  });

  const confirm = parseYesNo(await ask('Upsert this row? [Y/n]: '), true);
  if (!confirm) {
    console.log('Aborted.');
    process.exit(0);
  }

  const { error } = await supabaseAdmin
    .from('app_versions')
    .upsert(
      {
        platform,
        latest_version: latestVersion,
        min_supported_version: minSupportedVersion || null,
        soft_prompt_enabled: softPrompt,
        hard_block_enabled: hardBlock,
        update_message: updateMessage || null,
        store_url: storeUrl || null,
      },
      { onConflict: 'platform' }
    );

  if (error) {
    console.error('Upsert failed:', error.message);
    process.exit(1);
  }

  console.log('Upsert complete.');

  const previousLatest = (existingRow?.latest_version ?? '').trim();
  const didChangeLatest = previousLatest !== latestVersion.trim();
  if (sendPush && didChangeLatest && pushTitle && pushBody) {
    console.log('Sending release push...');
    await notifyAllDevicesForAppUpdate({
      title: pushTitle,
      body: pushBody,
      data: {
        latestVersion,
        platform,
        type: 'app_update',
      },
    });
    console.log('Release push sent.');
  } else if (sendPush && !didChangeLatest) {
    console.log('Latest version unchanged; skipping release push.');
  }

  process.exit(0);
}

run()
  .catch((err) => {
    console.error('Unexpected error:', err);
    process.exit(1);
  })
  .finally(() => {
    rl.close();
  });
