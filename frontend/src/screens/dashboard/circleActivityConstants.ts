import { AlertRow } from './alertTypes';

export const CIRCLE_ALERT_TYPES = new Set<string>([
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
