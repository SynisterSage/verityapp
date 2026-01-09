import { Request, Response } from 'express';
import logger from 'jet-logger';

import supabaseAdmin from '@src/services/supabase';
import HTTP_STATUS_CODES from '@src/common/constants/HTTP_STATUS_CODES';

async function getAuthenticatedUserId(req: Request) {
  const authHeader = req.header('authorization') ?? '';
  const token = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice('bearer '.length)
    : '';
  if (!token) {
    return '';
  }
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) {
    return '';
  }
  return data.user.id;
}

async function userCanAccessProfile(userId: string, profileId: string) {
  const { data: profileRow } = await supabaseAdmin
    .from('profiles')
    .select('caretaker_id')
    .eq('id', profileId)
    .maybeSingle();

  if (!profileRow) {
    return false;
  }

  if (profileRow.caretaker_id === userId) {
    return true;
  }

  const { data: memberRow } = await supabaseAdmin
    .from('profile_members')
    .select('id')
    .eq('profile_id', profileId)
    .eq('user_id', userId)
    .maybeSingle();

  return !!memberRow;
}

async function listAlerts(req: Request, res: Response) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
  }

  const { profileId, status, limit } = req.query as Record<string, string | undefined>;
  const parsedLimit = limit ? Number(limit) : 50;

  let profileIds: string[] = [];

  if (profileId) {
    const allowed = await userCanAccessProfile(userId, profileId);
    if (!allowed) {
      return res.status(HTTP_STATUS_CODES.Forbidden).json({ error: 'Forbidden' });
    }
    profileIds = [profileId];
  } else {
    const { data: caretakerProfiles } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('caretaker_id', userId);

    const { data: memberProfiles } = await supabaseAdmin
      .from('profile_members')
      .select('profile_id')
      .eq('user_id', userId);

    const caretakerIds = caretakerProfiles?.map((row) => row.id) ?? [];
    const memberIds = memberProfiles?.map((row) => row.profile_id) ?? [];
    profileIds = Array.from(new Set([...caretakerIds, ...memberIds]));
  }

  if (profileIds.length === 0) {
    return res.status(HTTP_STATUS_CODES.Ok).json({ alerts: [] });
  }

  let query = supabaseAdmin
    .from('alerts')
    .select('id, profile_id, call_id, alert_type, status, payload, created_at, calls:call_id (feedback_status, fraud_risk_level)')
    .in('profile_id', profileIds)
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  if (Number.isFinite(parsedLimit) && parsedLimit > 0) {
    query = query.limit(parsedLimit);
  }

  const { data, error } = await query;
  if (error) {
    logger.err(error);
    return res.status(HTTP_STATUS_CODES.InternalServerError).json({ error: 'Failed to load alerts' });
  }

  const alerts = data ?? [];
  const callIds = alerts
    .map((alert) => alert.call_id)
    .filter((callId): callId is string => Boolean(callId));

  let callMap = new Map<string, { feedback_status: string | null; fraud_risk_level: string | null }>();
  if (callIds.length > 0) {
    const { data: callRows } = await supabaseAdmin
      .from('calls')
      .select('id, feedback_status, fraud_risk_level')
      .in('id', callIds);
    callMap = new Map(
      (callRows ?? []).map((row) => [
        row.id,
        { feedback_status: row.feedback_status ?? null, fraud_risk_level: row.fraud_risk_level ?? null },
      ])
    );
  }

  const enriched = alerts.map((alert) => {
    const call = alert.call_id ? callMap.get(alert.call_id) : undefined;
    const feedback = call?.feedback_status ?? null;
    const payload = alert.payload as { riskLevel?: string; label?: string } | null;
    const payloadLabel = payload?.label ?? null;
    const payloadRisk = payload?.riskLevel ?? null;
    const riskLabel =
      feedback === 'marked_fraud'
        ? 'Fraud'
        : feedback === 'marked_safe'
        ? 'Safe'
        : payloadLabel ?? payloadRisk ?? 'alert';
    const riskLevel =
      feedback === 'marked_fraud'
        ? 'critical'
        : feedback === 'marked_safe'
        ? 'low'
        : call?.fraud_risk_level ?? payloadRisk ?? null;
    return {
      ...alert,
      call_feedback_status: feedback,
      call_fraud_risk_level: call?.fraud_risk_level ?? null,
      risk_label: riskLabel,
      risk_level: riskLevel,
    };
  });

  return res.status(HTTP_STATUS_CODES.Ok).json({ alerts: enriched });
}

async function updateAlertStatus(req: Request, res: Response) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
  }

  const { alertId } = req.params;
  const { status } = req.body as { status?: string };
  if (!alertId || !status) {
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Missing alertId or status' });
  }

  const allowedStatuses = new Set(['pending', 'acknowledged', 'resolved']);
  if (!allowedStatuses.has(status)) {
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Invalid status' });
  }

  const { data: alertRow, error: alertError } = await supabaseAdmin
    .from('alerts')
    .select('id, profile_id')
    .eq('id', alertId)
    .single();

  console.log('deleteAlert: id=', alertId, 'alertRow=', alertRow, 'error=', alertError);
  if (alertError || !alertRow) {
    return res.status(HTTP_STATUS_CODES.NotFound).json({ error: 'Alert not found' });
  }

  const allowed = await userCanAccessProfile(userId, alertRow.profile_id);
  console.log('deleteAlert access', { userId, profileId: alertRow.profile_id, allowed });
  if (!allowed) {
    return res.status(HTTP_STATUS_CODES.Forbidden).json({ error: 'Forbidden' });
  }

  const { error: updateError } = await supabaseAdmin
    .from('alerts')
    .update({ status })
    .eq('id', alertId);

  if (updateError) {
    logger.err(updateError);
    return res.status(HTTP_STATUS_CODES.InternalServerError).json({ error: 'Failed to update alert' });
  }

  return res.status(HTTP_STATUS_CODES.Ok).json({ ok: true });
}

async function deleteAlert(req: Request, res: Response) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
  }

  const { alertId } = req.params;
  if (!alertId) {
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Missing alertId' });
  }

  const { data: alertRow, error: alertError } = await supabaseAdmin
    .from('alerts')
    .select('id, profile_id')
    .eq('id', alertId)
    .single();

  if (alertError || !alertRow) {
    return res.status(HTTP_STATUS_CODES.NotFound).json({ error: 'Alert not found' });
  }

  const allowed = await userCanAccessProfile(userId, alertRow.profile_id);
  if (!allowed) {
    return res.status(HTTP_STATUS_CODES.Forbidden).json({ error: 'Forbidden' });
  }

  const { error: deleteError } = await supabaseAdmin.from('alerts').delete().eq('id', alertId);
  if (deleteError) {
    logger.err(deleteError);
    return res.status(HTTP_STATUS_CODES.InternalServerError).json({ error: 'Failed to delete alert' });
  }

  return res.status(HTTP_STATUS_CODES.Ok).json({ ok: true });
}

export default {
  listAlerts,
  updateAlertStatus,
  deleteAlert,
};
