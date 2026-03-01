import type { NavigatorScreenParams } from '@react-navigation/native';
import type { SupportResourceType } from '../data/resourceSections';

export type RootStackParamList = {
  SignIn: undefined;
  SignUp: undefined;
  ConfirmEmail: { email?: string; confirmed?: boolean };
  ResetPassword: undefined;
  OnboardingChoice: undefined;
  Membership: undefined;
  MembershipActivated: undefined;
  MembershipExperience: undefined;
  WhyChooseVerity: undefined;
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
  PermissionPriming: undefined;
  AppTabs: NavigatorScreenParams<TabParamList> | undefined;
  CallDetailModal: { callId: string; compact?: boolean };
  TrustedCallDetail: { alertId: string };
  CircleActivityDetail: { alertId: string };
  SupportPortal: { initialResource?: SupportResourceType } | undefined;
  SupportModal: { ticketId?: string | null; profileId?: string | null; newTicket?: boolean; autoEnd?: boolean };
  SupportResource: { resource: SupportResourceType; title?: string };
  CircleActivityModal: { activities?: import('../screens/dashboard/circleActivityTypes').CircleActivityItem[] };
  ActiveCallModal: {
    callSid?: string;
    fromNumber?: string | null;
    toNumber?: string | null;
    status?: string;
  };
};

export type TabParamList = {
  HomeTab: undefined;
  CallsTab: NavigatorScreenParams<CallsStackParamList> | undefined;
  AlertsTab: { initialMode?: 'needs' | 'history' } | undefined;
  SettingsTab: NavigatorScreenParams<SettingsStackParamList> | undefined;
};

export type CallsStackParamList = {
  Calls:
    | {
        initialCallId?: string;
        initialFilter?: 'all' | 'verified' | 'risk' | 'trusted' | 'handled' | 'archived';
      }
    | undefined;
  CallDetail: { callId: string };
};

export type SettingsStackParamList = {
  Settings: { initialScreen?: 'Blocklist' } | undefined;
  Account: undefined;
  MembershipBilling: undefined;
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
  SupportInfo: undefined;
  HowItWorks: undefined;
  WhatsNew: undefined;
  SafetyIntelligence: undefined;
};
