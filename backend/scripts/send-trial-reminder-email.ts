import { join } from 'node:path';
import fs from 'node:fs/promises';

import logger from 'jet-logger';

import supabaseAdmin from '@src/services/supabase';
import { sendEmail } from '@src/services/email';
import { reserveTrialNudgeEvent } from '@src/services/trialNudgeEvents';

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = Math.max(1, Number(process.env.TRIAL_REMINDER_EMAIL_WINDOW_DAYS ?? '1'));
const WINDOW_MS = WINDOW_DAYS * DAY_MS;
const SUPPORT_LINK = process.env.SUPPORT_PORTAL_URL ?? 'https://verityprotect.com/support';
const TEMPLATE_PATH = join(__dirname, '../templates/emails/trial-ending-soon.html');
const NUDGE_KEY = process.env.TRIAL_REMINDER_EMAIL_NUDGE_KEY ?? `trial_email_${WINDOW_DAYS}day`;
const CHANNEL: 'email' = 'email';

const PLAN_LABELS: Record<string, string> = {
  verityprotect_monthly: 'Monthly membership',
  verityprotect_annual: 'Annual membership',
};

type CandidateRow = {
  user_id: string;
  product_id: string | null;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  status: string;
  is_active: boolean;
};

type ProfileRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

let cachedTemplate: string | null = null;

function render(template: string, data: Record<string, string | number>) {
  return Object.entries(data).reduce(
    (text, [key, value]) => text.replace(new RegExp(`{{${key}}}`, 'g'), String(value)),
    template
  );
}

async function loadTemplate() {
  if (cachedTemplate) {
    return cachedTemplate;
  }
  const raw = await fs.readFile(TEMPLATE_PATH, 'utf-8');
  cachedTemplate = raw;
  return raw;
}

function formatPlanLabel(productId: string | null) {
  if (!productId) {
    return 'Verity Protect membership';
  }
  return PLAN_LABELS[productId] ?? productId.replace(/_/g, ' ');
}

function formatProfileNames(profiles: ProfileRow[] | null | undefined) {
  if (!profiles || profiles.length === 0) {
    return 'your Verity circle';
  }
  const names = profiles
    .map((row) => [row.first_name, row.last_name].filter(Boolean).join(' ').trim())
    .filter(Boolean);
  return names.length > 0 ? names.join(', ') : 'your Verity circle';
}

async function removeTrialNudgeReservation(userId: string) {
  const { error } = await supabaseAdmin
    .from('trial_nudge_events')
    .delete()
    .match({ user_id: userId, nudge_key: NUDGE_KEY, channel: CHANNEL });
  if (error) {
    logger.warn(`Failed to delete redelivered trial reminder for user=${userId}: ${error.message}`);
  }
}

async function main() {
  const template = await loadTemplate();
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const windowEndIso = new Date(nowMs + WINDOW_MS).toISOString();

  const { data, error } = await supabaseAdmin
    .from('user_subscriptions')
    .select('user_id, product_id, trial_started_at, trial_ends_at, status, is_active')
    .not('trial_started_at', 'is', null)
    .not('trial_ends_at', 'is', null)
    .is('trial_converted_at', null)
    .is('trial_reclaimed_at', null)
    .is('trial_purged_at', null)
    .gte('trial_ends_at', nowIso)
    .lte('trial_ends_at', windowEndIso);

  if (error) {
    logger.err(error);
    logger.warn('Failed to load trial reminder candidates');
    process.exit(1);
  }

  const candidates = (data ?? []) as CandidateRow[];
  if (candidates.length === 0) {
    logger.info('No trials ending within the reminder window. Nothing to send.');
    return;
  }

  let emailsSent = 0;

  for (const row of candidates) {
    if (!row.trial_ends_at) {
      continue;
    }
    const trialEndsAtMs = Date.parse(row.trial_ends_at);
    if (!Number.isFinite(trialEndsAtMs) || trialEndsAtMs < nowMs) {
      continue;
    }

    const msUntilEnd = trialEndsAtMs - nowMs;
    const daysLeft = Math.max(0, Math.ceil(msUntilEnd / DAY_MS));
    const daysLabel = daysLeft <= 1 ? '1 day' : `${daysLeft} days`;
    const planLabel = formatPlanLabel(row.product_id);

    const { data: profileData, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, first_name, last_name')
      .eq('caretaker_id', row.user_id);
    if (profileError) {
      logger.err(profileError);
      logger.warn(`Failed to load profiles for user=${row.user_id}`);
      continue;
    }
    const profileList = formatProfileNames(profileData ?? []);
    const profileId = Array.isArray(profileData) && profileData[0]?.id ? profileData[0].id : null;

    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(row.user_id);
    if (userError) {
      logger.err(userError);
      logger.warn(`Failed to load user ${row.user_id}`);
      continue;
    }
    const recipientEmail = userData.user?.email;
    if (!recipientEmail) {
      logger.warn(`User ${row.user_id} has no email address, skipping trial reminder`);
      continue;
    }

    let reserved = false;
    try {
      reserved = await reserveTrialNudgeEvent({
        userId: row.user_id,
        channel: CHANNEL,
        nudgeKey: NUDGE_KEY,
        profileId,
        metadata: {
          trialEndsAt: row.trial_ends_at,
          productId: row.product_id,
          status: row.status,
          isActive: row.is_active,
        },
      });
    } catch (reserveError) {
      logger.err(reserveError as Error);
      throw new Error('Failed to reserve trial reminder email slot');
    }

    if (!reserved) {
      logger.info(`[trial-reminder-email] already delivered to user=${row.user_id}`);
      continue;
    }

    const trialDate = new Date(trialEndsAtMs);
    const trialEndDate = new Intl.DateTimeFormat('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(trialDate);
    const trialEndTime = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'UTC',
    }).format(trialDate);

    const html = render(template, {
      planLabel,
      profileList,
      trialDaysLeft: daysLabel,
      trialEndDate,
      trialEndTime: `${trialEndTime} UTC`,
      supportLink: SUPPORT_LINK,
      windowDays: WINDOW_DAYS,
    });

    try {
      await sendEmail({
        to: recipientEmail,
        subject: `Your Verity trial ends in ${daysLabel}`,
        html,
      });
      emailsSent += 1;
      logger.info(`Sent trial reminder email to ${recipientEmail} for user=${row.user_id}`);
    } catch (sendError) {
      logger.err(sendError as Error);
      logger.warn(`Failed to send trial reminder to ${recipientEmail}`);
      await removeTrialNudgeReservation(row.user_id);
    }
  }

  logger.info(
    `[trial-reminder-email] completed windowDays=${WINDOW_DAYS} candidates=${candidates.length} emailsSent=${emailsSent}`
  );
}

if (require.main === module) {
  main().catch((err) => {
    logger.err(err as Error);
    logger.warn('Unexpected error while sending trial reminder emails');
    process.exit(1);
  });
}
