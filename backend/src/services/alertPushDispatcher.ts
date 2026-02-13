import logger from 'jet-logger';

import supabaseAdmin from '@src/services/supabase';
import { notifyProfileForAlert } from '@src/services/pushNotifications';

type AlertLike = {
  id: string;
  profile_id: string;
  call_id?: string | null;
  alert_type: string;
  payload?: Record<string, unknown> | null;
  created_at?: string;
};

const PUSH_RATE_LIMIT_MS = 60_000;

const CIRCLE_ALERT_TYPES = new Set<string>([
  'circle_invite',
  'pin_change',
  'safe_phrase_added',
  'trusted_contact_added',
  'blocked_caller_added',
  'security_password',
  'member_joined',
  'member_role_changed',
  'member_removed',
  'automation_settings_updated',
  'data_exported',
  'data_cleared',
]);

type PushRouteTarget = 'call_detail' | 'calls_trusted' | 'circle_activity' | 'alerts';

function coerceString(value: unknown) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function buildPushRoute(alertType: string): PushRouteTarget {
  if (alertType === 'fraud') return 'call_detail';
  if (alertType === 'trusted') return 'calls_trusted';
  if (CIRCLE_ALERT_TYPES.has(alertType)) return 'circle_activity';
  return 'alerts';
}

function buildPushContent(alert: AlertLike) {
  const alertType = coerceString(alert.alert_type).toLowerCase();
  const payload = (alert.payload ?? {}) as Record<string, unknown>;

  if (alertType === 'fraud') {
    const scoreRaw = payload.score;
    const score =
      typeof scoreRaw === 'number'
        ? Math.round(scoreRaw)
        : typeof scoreRaw === 'string'
        ? Number.parseInt(scoreRaw, 10)
        : null;
    const riskLevel = coerceString(payload.riskLevel);
    return {
      title: score ? `Priority alert (${score}%)` : 'Priority alert',
      body: riskLevel ? `Potential ${riskLevel} risk call detected.` : 'Potential fraud call detected.',
    };
  }

  if (alertType === 'trusted') {
    const contactName = coerceString(payload.contactName);
    const callerNumber = coerceString(payload.callerNumber);
    return {
      title: 'Trusted caller connected',
      body: contactName || callerNumber || 'A trusted caller reached this profile.',
    };
  }

  if (alertType === 'pin_change') {
    return {
      title: 'Safety PIN updated',
      body: coerceString(payload.message) || 'A profile member updated the Safety PIN.',
    };
  }

  if (CIRCLE_ALERT_TYPES.has(alertType)) {
    return {
      title: 'Circle activity update',
      body: coerceString(payload.message) || 'There is a new update in your circle activity.',
    };
  }

  return {
    title: 'New alert',
    body: coerceString(payload.message) || 'There is a new alert on this profile.',
  };
}

async function pushEnabledForProfile(profileId: string) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('enable_push_alerts')
    .eq('id', profileId)
    .maybeSingle();

  if (error) {
    logger.err(error);
    return false;
  }
  return data?.enable_push_alerts !== false;
}

async function isRateLimited(profileId: string, currentAlertId: string) {
  const cutoffIso = new Date(Date.now() - PUSH_RATE_LIMIT_MS).toISOString();
  const { data, error } = await supabaseAdmin
    .from('alerts')
    .select('id')
    .eq('profile_id', profileId)
    .neq('id', currentAlertId)
    .gte('created_at', cutoffIso)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    logger.err(error);
    return false;
  }
  return Boolean(data?.length);
}

export async function dispatchAlertPush(alert: AlertLike) {
  if (!alert?.id || !alert?.profile_id || !alert?.alert_type) {
    return;
  }

  const pushEnabled = await pushEnabledForProfile(alert.profile_id);
  if (!pushEnabled) {
    logger.info(
      `[push-dispatch] skipped disabled profile=${alert.profile_id} alert=${alert.id} type=${alert.alert_type}`
    );
    return;
  }

  const rateLimited = await isRateLimited(alert.profile_id, alert.id);
  if (rateLimited) {
    logger.info(
      `[push-dispatch] skipped rate_limited profile=${alert.profile_id} alert=${alert.id} type=${alert.alert_type}`
    );
    return;
  }

  const routeTarget = buildPushRoute(alert.alert_type);
  const content = buildPushContent(alert);
  const callId = alert.call_id ?? undefined;

  logger.info(
    `[push-dispatch] send start profile=${alert.profile_id} alert=${alert.id} type=${alert.alert_type} route=${routeTarget}`
  );

  try {
    await notifyProfileForAlert(alert.profile_id, {
      alertId: alert.id,
      callId,
      title: content.title,
      body: content.body,
      data: {
        alertType: alert.alert_type,
        routeTarget,
        ...(callId ? { callId } : {}),
      },
    });
    logger.info(
      `[push-dispatch] send success profile=${alert.profile_id} alert=${alert.id} type=${alert.alert_type}`
    );
  } catch (error) {
    logger.err(error as Error);
    logger.warn(
      `[push-dispatch] send failed profile=${alert.profile_id} alert=${alert.id} type=${alert.alert_type}`
    );
  }
}

