/**
 * Returns an onPress handler for a circle activity alert that routes the user
 * to the relevant settings screen. Returns undefined if no destination applies.
 */
export function getCircleAlertDestination(
  alertType: string | null | undefined,
  navigate: (screen: string, params?: object) => void
): (() => void) | undefined {
  switch (alertType) {
    case 'safe_phrase_added':
      return () => navigate('SettingsTab', { screen: 'SafePhrases' });

    case 'trusted_contact_added':
      return () => navigate('SettingsTab', { screen: 'TrustedContacts' });

    case 'blocked_caller_added':
      return () => navigate('SettingsTab', { screen: 'Blocklist' });

    case 'automation_settings_updated':
      return () => navigate('SettingsTab', { screen: 'Automation' });

    case 'pin_change':
    case 'security_password':
      return () => navigate('SettingsTab', { screen: 'Security' });

    case 'member_joined':
    case 'member_role_changed':
    case 'member_removed':
    case 'circle_invite':
      return () => navigate('SettingsTab', { screen: 'Members' });

    case 'data_exported':
    case 'data_cleared':
      return () => navigate('SettingsTab', { screen: 'DataPrivacy' });

    default:
      return undefined;
  }
}
