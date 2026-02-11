import { join } from 'node:path';
import fs from 'node:fs/promises';

import logger from 'jet-logger';

import supabaseAdmin from '@src/services/supabase';
import { sendEmail } from '@src/services/email';

const WINDOW_DAYS = Number(process.env.ALERT_REPORT_WINDOW_DAYS ?? '7');
const SUPPORT_LINK = process.env.SUPPORT_PORTAL_URL ?? 'https://verityprotect.com/support';

const TEMPLATE_PATH = join(__dirname, '../templates/emails/weekly-alert-report.html');
let cachedTemplate: string | null = null;

function render(template: string, data: Record<string, string | number>) {
  return Object.entries(data).reduce((text, [key, value]) => text.replace(new RegExp(`{{${key}}}`, 'g'), String(value)), template);
}

async function loadTemplate() {
  if (cachedTemplate) {
    return cachedTemplate;
  }
  const raw = await fs.readFile(TEMPLATE_PATH, 'utf-8');
  cachedTemplate = raw;
  return raw;
}

async function countRows(table: string, profileId: string, since?: string) {
  const query = supabaseAdmin
    .from(table)
    .select('id', { head: true, count: 'exact' })
    .eq('profile_id', profileId);
  if (since) {
    query.gte('created_at', since);
  }
  const { count, error } = await query;
  if (error) {
    logger.err(error);
    logger.warn(`Failed to count ${table}`);
    return 0;
  }
  return count ?? 0;
}

async function gatherOpenTicketCount(profileId: string) {
  const { data, error } = await supabaseAdmin
    .from('support_messages')
    .select('metadata')
    .eq('profile_id', profileId)
    .eq('metadata->>ticketState', 'open');
  if (error) {
    logger.err(error);
    logger.warn('Failed to fetch open tickets');
    return 0;
  }
  const seen = new Set<string>();
  (data ?? []).forEach((row) => {
    const ticketId = (row.metadata as Record<string, unknown> | null)?.ticketId;
    if (typeof ticketId === 'string' && ticketId.trim()) {
      seen.add(ticketId);
    }
  });
  return seen.size;
}

async function gatherAlertSummary(profileId: string, since: string) {
  const { data, error } = await supabaseAdmin
    .from('alerts')
    .select('status')
    .eq('profile_id', profileId)
    .gte('created_at', since);
  if (error) {
    logger.err(error);
    logger.warn('Failed to fetch alerts');
    return { summary: '0 alerts', pending: 0, total: 0 };
  }
  const alerts = data ?? [];
  const total = alerts.length;
  const pending = alerts.filter((alert) => alert.status === 'pending').length;
  const resolved = total - pending;
  const summary = `${total} ${total === 1 ? 'alert' : 'alerts'} (${pending} pending, ${resolved} resolved)`;
  return { summary, pending, total };
}

async function getCaretakerEmail(caretakerId: string) {
  const { data } = await supabaseAdmin.auth.admin.getUserById(caretakerId);
  return data.user?.email ?? null;
}

function formatProfileName(profile: ProfileRecord) {
  return [profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.id;
}

type ProfileRecord = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  caretaker_id: string;
  auto_mark_enabled: boolean | null;
  auto_mark_fraud_threshold: number | null;
  auto_mark_safe_threshold: number | null;
};

async function main() {
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: profiles, error } = await supabaseAdmin
    .from('profiles')
    .select(
      'id, first_name, last_name, caretaker_id, auto_mark_enabled, auto_mark_fraud_threshold, auto_mark_safe_threshold'
    )
    .eq('enable_email_alerts', true);
  if (error) {
    logger.err(error);
    logger.warn('Failed to load profiles for weekly alerts');
    process.exit(1);
  }
  const template = await loadTemplate();
  if (!profiles || profiles.length === 0) {
    logger.info('No profiles have email alerts enabled. Nothing to send.');
    return;
  }
  for (const profile of profiles as ProfileRecord[]) {
    try {
      const caretakerEmail = await getCaretakerEmail(profile.caretaker_id);
      if (!caretakerEmail) {
        logger.warn(`No email for caretaker ${profile.caretaker_id}, skipping profile ${profile.id}`);
        continue;
      }
      const profileName = formatProfileName(profile);
      const callCount = await countRows('calls', profile.id, since);
      const blockedCount = await countRows('blocked_callers', profile.id, since);
      const trustedCount = await countRows('trusted_contacts', profile.id, since);
      const safePhraseCount = await countRows('fraud_safe_phrases', profile.id, since);
      const newMemberCount = await countRows('profile_members', profile.id, since);
      const openTickets = await gatherOpenTicketCount(profile.id);
      const alertInfo = await gatherAlertSummary(profile.id, since);
      const automationNotes = profile.auto_mark_enabled
        ? `Automation filters calls at fraud ${profile.auto_mark_fraud_threshold ?? 90} and safe ${profile.auto_mark_safe_threshold ?? 20}.`
        : 'Automation is paused for now, so every alert is reviewed manually.';
      const content = render(template, {
        profileName,
        windowDays: WINDOW_DAYS,
        callCount,
        blockedCount,
        trustedCount,
        safePhraseCount,
        newMemberCount,
        openTickets,
        alertSummary: alertInfo.summary,
        automationNotes,
        supportLink: SUPPORT_LINK,
      });
      await sendEmail({
        to: caretakerEmail,
        subject: `Weekly safety summary for ${profileName}`,
        html: content,
      });
      logger.info(`Sent weekly safety summary to ${caretakerEmail} for profile ${profile.id}`);
    } catch (err) {
      logger.err(err as Error);
      logger.warn(`Failed to send weekly summary for profile ${profile.id}`);
    }
  }
}

if (require.main === module) {
  main().catch((err) => {
    logger.err(err as Error);
    logger.warn('Unexpected error while sending weekly alert reports');
    process.exit(1);
  });
}
