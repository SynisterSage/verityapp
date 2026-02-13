import supabaseAdmin from '@src/services/supabase';
import { dispatchAlertPush } from '@src/services/alertPushDispatcher';

export type CircleAlertPayload = Record<string, unknown>;

export async function recordCircleAlert({
  profileId,
  alertType,
  payload = {},
  status = 'resolved',
}: {
  profileId: string;
  alertType: string;
  payload?: CircleAlertPayload;
  status?: string;
}) {
  const { data: profileRow, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('caretaker_id')
    .eq('id', profileId)
    .maybeSingle();

  if (profileError) {
    throw profileError;
  }

  const { data: alertRow, error } = await supabaseAdmin
    .from('alerts')
    .insert({
      profile_id: profileId,
      caretaker_id: profileRow?.caretaker_id ?? null,
      alert_type: alertType,
      status,
      payload,
    })
    .select('id, profile_id, call_id, alert_type, payload, created_at')
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (alertRow) {
    await dispatchAlertPush(alertRow);
  }
}
