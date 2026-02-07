export type RootStackParamList = {
  SignIn: undefined;
  SignUp: undefined;
  ConfirmEmail: { email?: string; confirmed?: boolean };
  ResetPassword: undefined;
  OnboardingChoice: undefined;
  OnboardingProfile: undefined;
  OnboardingPasscode: undefined;
  OnboardingTrustedContacts: undefined;
  OnboardingSafePhrases: undefined;
  OnboardingInviteFamily: undefined;
  OnboardingAlerts: undefined;
  OnboardingCallForwarding: undefined;
  OnboardingTestCall: undefined;
  OnboardingInviteCode: undefined;
  OnboardingSuccess: undefined;
  AppTabs: undefined;
  CallDetailModal: { callId: string; compact?: boolean };
  CircleActivityModal: { activities: import('../screens/dashboard/circleActivityTypes').CircleActivityItem[] };
};

export type TabParamList = {
  HomeTab: undefined;
  CallsTab: undefined;
  AlertsTab: undefined;
  SettingsTab: undefined;
};

export type CallsStackParamList = {
  Calls: { initialCallId?: string } | undefined;
  CallDetail: { callId: string };
};

export type SettingsStackParamList = {
  Settings: { initialScreen?: 'Blocklist' } | undefined;
  Account: undefined;
  Notifications: undefined;
  Security: undefined;
  ChangePasscode: undefined;
  SafePhrases: undefined;
  TrustedContacts: undefined;
  Blocklist: undefined;
  DataPrivacy: undefined;
  Automation: undefined;
  EnterInviteCode: undefined;
  Members: { highlightInviteEntry?: boolean } | undefined;
};
