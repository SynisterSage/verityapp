import supabaseAdmin from '@src/services/supabase';

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
  await supabaseAdmin.from('alerts').insert({
    profile_id: profileId,
    alert_type: alertType,
    status,
    payload,
  });
}
