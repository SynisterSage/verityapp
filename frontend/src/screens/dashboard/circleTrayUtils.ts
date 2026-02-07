import { AlertRow } from './alertTypes';
import { CIRCLE_ALERT_TYPES } from './circleActivityConstants';
import { formatAlertDateLabel, formatAlertTime } from './alertTimeUtils';

function joinChanges(changes?: string[]) {
  if (!Array.isArray(changes) || changes.length === 0) {
    return undefined;
  }
  return changes.join(' · ');
}

type CircleTrayCopy = {
  title: string;
  subtitle: string;
  detail?: string;
};

export function getCircleTrayCopy(alert: AlertRow, fallbackDisplay?: string): CircleTrayCopy {
  const actorLabel = alert.payload?.actor_label ?? 'Circle member';
  const displayTitle = 'Circle activity';
  let detail = fallbackDisplay ?? alert.payload?.message;
  if (!detail && CIRCLE_ALERT_TYPES.has(alert.alert_type ?? '')) {
      switch (alert.alert_type) {
        case 'pin_change':
          detail = alert.payload?.message ?? 'Updated the Safety PIN.';
          break;
        case 'circle_invite':
        detail =
          alert.payload?.message ??
          `Shared an invite${alert.payload?.invite_role ? ` for ${alert.payload.invite_role}` : ''}.`;
        break;
      case 'security_password':
        detail = alert.payload?.message ?? 'Updated the account password.';
        break;
      case 'safe_phrase_added':
        detail = alert.payload?.message ?? `Added safe word "${alert.payload?.phrase ?? ''}".`;
        break;
      case 'trusted_contact_added':
        detail =
          alert.payload?.message ??
          `Added ${alert.payload?.added ?? 1} trusted contact${(alert.payload?.added ?? 1) === 1 ? '' : 's'}.`;
          break;
        case 'blocked_caller_added':
          detail = alert.payload?.message ?? `Blocked number ${alert.payload?.caller_number ?? ''}.`;
          break;
      case 'data_exported':
        detail = alert.payload?.message ?? 'Downloaded the profile export.';
        break;
      case 'data_cleared':
        detail = alert.payload?.message ?? 'Cleared the call and alert history.';
        break;
        case 'member_joined': {
        const label = alert.payload?.actor_label ?? 'A member';
        detail = alert.payload?.message ?? `${label} joined the circle.`;
        break;
      }
      case 'member_role_changed': {
        const targetLabel = alert.payload?.target_display_name ?? 'A member';
        const targetRole = alert.payload?.target_role === 'admin' ? 'Caretaker' : 'Family member';
        detail = alert.payload?.message ?? `Set ${targetLabel} as ${targetRole}.`;
        break;
      }
      case 'member_removed': {
        const targetLabel = alert.payload?.target_display_name ?? 'a member';
        detail = alert.payload?.message ?? `Removed ${targetLabel} from the circle.`;
        break;
      }
      case 'automation_settings_updated': {
        const changeText =
          joinChanges(alert.payload?.changes) ??
          alert.payload?.message ??
          'Updated automation settings.';
        detail = changeText;
        break;
      }
    }
  }
  return { title: displayTitle, subtitle: actorLabel, detail };
}

export function getCircleTrayDisplay(alert: AlertRow): string {
  const handledTimestamp = alert.feedback_at ?? alert.created_at;
  if (!handledTimestamp) return '';
  const formattedTime = formatAlertTime(handledTimestamp);
  const formattedDate = formatAlertDateLabel(handledTimestamp);
  if (formattedDate) {
    return `${formattedTime} · ${formattedDate}`;
  }
  return formattedTime;
}
