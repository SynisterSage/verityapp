import type { NavigatorScreenParams } from '@react-navigation/native';
import type { SupportResourceType } from '../data/resourceSections';

export type RootStackParamList = {
  SignIn:
    | {
        facilityClaimPrompt?: boolean;
        facilitySlug?: string;
        inviteClaimPrompt?: boolean;
      }
    | undefined;
  SignUp:
    | {
        facilityClaimPrompt?: boolean;
        facilitySlug?: string;
        inviteClaimPrompt?: boolean;
      }
    | undefined;
  ConfirmEmail: { email?: string; confirmed?: boolean };
  ResetPassword: undefined;
  OnboardingChoice: undefined;
  Membership: undefined;
  MembershipActivated: undefined;
  MembershipFacilityOffer:
    | {
        initialCode?: string;
        claimToken?: string;
        facilitySlug?: string;
        source?: 'deeplink' | 'in_app';
      }
    | undefined;
  MembershipExperience: undefined;
  WhyChooseVerity: undefined;
  OnboardingProfile: undefined;
  OnboardingPasscode: undefined;
  OnboardingTrustedContacts: undefined;
  OnboardingSafePhrases: { source?: 'onboarding' | 'nudge' } | undefined;
  OnboardingInviteFamily: undefined;
  OnboardingAlerts: { source?: 'onboarding' | 'nudge' } | undefined;
  OnboardingCallForwarding: { source?: 'onboarding' | 'nudge' } | undefined;
  OnboardingTestCall: { source?: 'onboarding' | 'nudge' } | undefined;
  OnboardingInviteCode:
    | {
        initialCode?: string;
        source?: 'manual' | 'deeplink';
      }
    | undefined;
  OnboardingSuccess: undefined;
  PermissionPriming: undefined;
  AppTabs: NavigatorScreenParams<TabParamList> | undefined;
  CallDetailModal: { callId: string; compact?: boolean };
  TrustedCallDetail: { alertId: string };
  WhatsNew: undefined;
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
  EnterInviteCode:
    | {
        initialCode?: string;
      }
    | undefined;
  Members: { highlightInviteEntry?: boolean } | undefined;
  SupportInfo: undefined;
  HowItWorks: undefined;
  WhatsNew: undefined;
  SafetyIntelligence: undefined;
};
