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

type PushRouteTarget = 'call_detail' | 'trusted_call_detail' | 'calls_trusted' | 'circle_activity' | 'alerts';

function coerceString(value: unknown) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function normalizeAlertType(value: unknown) {
  return coerceString(value).toLowerCase();
}

function normalizePushSentence(value: unknown, fallback: string) {
  const normalized = coerceString(value).replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return fallback;
  }
  const compact = normalized.slice(0, 120).trim();
  return compact.endsWith('.') || compact.endsWith('!') || compact.endsWith('?')
    ? compact
    : `${compact}.`;
}

function buildPushRoute(alertType: string, callId?: string | null): PushRouteTarget {
  if (alertType === 'trusted') return 'trusted_call_detail';
  if (CIRCLE_ALERT_TYPES.has(alertType)) return 'circle_activity';
  if (callId) return 'call_detail';
  return 'alerts';
}

function buildPushContent(alert: AlertLike) {
  const alertType = normalizeAlertType(alert.alert_type);
  const payload = (alert.payload ?? {}) as Record<string, unknown>;

  if (alertType === 'fraud') {
    const scoreRaw = payload.score;
    const score =
      typeof scoreRaw === 'number'
        ? Math.round(scoreRaw)
        : typeof scoreRaw === 'string'
        ? Number.parseInt(scoreRaw, 10)
        : null;
    const riskLevel = normalizeAlertType(payload.riskLevel);
    const isCritical = riskLevel === 'critical' || (typeof score === 'number' && score >= 85);
    return {
      title: isCritical ? 'Critical Call Alert' : 'Call Risk Alert',
      body: normalizePushSentence(
        payload.message,
        isCritical
          ? 'Possible scam detected. Review this call now.'
          : 'Possible scam detected. Review this call.'
      ),
    };
  }

  if (alertType === 'trusted') {
    const contactName = coerceString(payload.contactName);
    const callerNumber = coerceString(payload.callerNumber);
    const callerLabel = contactName || callerNumber;
    const bridged = payload.bridged === true;
    return {
      title: 'Trusted Call Activity',
      body: normalizePushSentence(
        payload.message,
        callerLabel
          ? bridged
            ? `Incoming trusted call from ${callerLabel}`
            : `Trusted caller activity from ${callerLabel}`
          : 'Trusted caller activity detected'
      ),
    };
  }

  if (alertType === 'pin_change') {
    return {
      title: 'Safety Pin Updated',
      body: normalizePushSentence(
        payload.message,
        'Someone in your circle updated the safety pin'
      ),
    };
  }

  if (CIRCLE_ALERT_TYPES.has(alertType)) {
    return {
      title: 'Circle Activity Update',
      body: normalizePushSentence(payload.message, 'There is a new update in your circle'),
    };
  }

  return {
    title: 'New Alert Available',
    body: normalizePushSentence(
      payload.message,
      'Open Verity Protect to review this alert'
    ),
  };
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

  const rateLimited = await isRateLimited(alert.profile_id, alert.id);
  if (rateLimited) {
    logger.info(
      `[push-dispatch] skipped rate_limited profile=${alert.profile_id} alert=${alert.id} type=${alert.alert_type}`
    );
    return;
  }

  const normalizedAlertType = normalizeAlertType(alert.alert_type);
  const callId = alert.call_id ?? undefined;
  const routeTarget = buildPushRoute(normalizedAlertType, callId);
  const content = buildPushContent(alert);

  logger.info(
    `[push-dispatch] send start profile=${alert.profile_id} alert=${alert.id} type=${normalizedAlertType} route=${routeTarget}`
  );

  try {
    await notifyProfileForAlert(alert.profile_id, {
      alertId: alert.id,
      callId,
      title: content.title,
      body: content.body,
      data: {
        alertType: normalizedAlertType,
        alert_type: normalizedAlertType,
        routeTarget,
        route_target: routeTarget,
        profileId: alert.profile_id,
        profile_id: alert.profile_id,
        ...(callId ? { callId } : {}),
        ...(callId ? { call_id: callId } : {}),
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
