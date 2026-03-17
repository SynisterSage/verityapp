import 'react-native-gesture-handler';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  DefaultTheme,
  DarkTheme,
  NavigationContainer,
  useNavigation,
  CommonActions,
} from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { enableScreens } from 'react-native-screens';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  Alert,
  AppState,
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  SafeAreaProvider,
  initialWindowMetrics,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PostHogProvider } from 'posthog-react-native';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { ProfileProvider, useProfile } from './src/context/ProfileContext';
import { SubscriptionProvider, useSubscription } from './src/context/SubscriptionContext';
import { AlertProvider } from './src/context/AlertContext';
import { SupportProvider } from './src/context/SupportContext';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { authorizedFetch } from './src/services/backend';
import { supabase } from './src/services/supabase';
import { getPublicEnv } from './src/services/publicConfig';
import SignInScreen from './src/screens/auth/SignInScreen';
import SignUpScreen from './src/screens/auth/SignUpScreen';
import ConfirmEmailScreen from './src/screens/auth/ConfirmEmailScreen';
import HomeScreen from './src/screens/dashboard/HomeScreen';
import CallsScreen from './src/screens/dashboard/CallsScreen';
import CallDetailScreen from './src/screens/dashboard/CallDetailScreen';
import TrustedCallDetailScreen from './src/screens/dashboard/TrustedCallDetailScreen';
import ActiveCallScreen from './src/screens/dashboard/ActiveCallScreen';
import CircleActivityScreen from './src/screens/dashboard/CircleActivityScreen';
import AlertsScreen from './src/screens/dashboard/AlertsScreen';
import SettingsScreen from './src/screens/settings/SettingsScreen';
import MembershipBillingScreen from './src/screens/settings/MembershipBillingScreen';
import SafePhrasesScreen from './src/screens/settings/SafePhrasesScreen';
import BlocklistScreen from './src/screens/settings/BlocklistScreen';
import DataPrivacyScreen from './src/screens/settings/DataPrivacyScreen';
import TrustedContactsScreen from './src/screens/settings/TrustedContactsScreen';
import AccountScreen from './src/screens/settings/AccountScreen';
import SecurityScreen from './src/screens/settings/SecurityScreen';
import ChangePasscodeScreen from './src/screens/settings/ChangePasscodeScreen';
import ResetPasswordScreen from './src/screens/auth/ResetPasswordScreen';
import NotificationsScreen from './src/screens/settings/NotificationsScreen';
import AutomationScreen from './src/screens/settings/AutomationScreen';
import EnterInviteCodeScreen from './src/screens/settings/EnterInviteCodeScreen';
import MembersScreen from './src/screens/settings/MembersScreen';
import SupportInfoScreen from './src/screens/settings/SupportInfoScreen';
import HowItWorksScreen from './src/screens/settings/HowItWorksScreen';
import WhatsNewScreen from './src/screens/settings/WhatsNewScreen';
import CircleActivityDetailScreen from './src/screens/dashboard/CircleActivityDetailScreen';
import DoctorLookupScreen from './src/screens/settings/DoctorLookupScreen';
import SupportScreen from './src/screens/support/SupportScreen';
import SupportTicketsScreen from './src/screens/support/SupportTicketsScreen';
import SupportResourceScreen from './src/screens/support/SupportResourceScreen';
import CreateProfileScreen from './src/screens/onboarding/CreateProfileScreen';
import PasscodeScreen from './src/screens/onboarding/PasscodeScreen';
import OnboardingSafePhrasesScreen from './src/screens/onboarding/OnboardingSafePhrasesScreen';
import InviteFamilyScreen from './src/screens/onboarding/InviteFamilyScreen';
import AlertPrefsScreen from './src/screens/onboarding/AlertPrefsScreen';
import TestCallScreen from './src/screens/onboarding/TestCallScreen';
import OnboardingTrustedContactsScreen from './src/screens/onboarding/OnboardingTrustedContactsScreen';
import OnboardingCallForwardingScreen from './src/screens/onboarding/OnboardingCallForwardingScreen';
import BottomDock from './src/components/navigation/BottomDock';
import SplashScreen from './src/components/common/SplashScreen';
import TrialReminderModal from './src/components/common/TrialReminderModal';
import OnboardingChoiceScreen from './src/screens/onboarding/OnboardingChoiceScreen';
import OnboardingInviteCodeScreen from './src/screens/onboarding/OnboardingInviteCodeScreen';
import OnboardingSuccessScreen from './src/screens/onboarding/OnboardingSuccessScreen';
import PermissionPrimingScreen from './src/screens/onboarding/PermissionPrimingScreen';
import MembershipScreen from './src/screens/onboarding/MembershipScreen';
import MembershipActivatedScreen from './src/screens/onboarding/MembershipActivatedScreen';
import MembershipFacilityOfferScreen from './src/screens/onboarding/MembershipFacilityOfferScreen';
import MembershipExperienceScreen from './src/screens/onboarding/MembershipExperienceScreen';
import WhyChooseVerityScreen from './src/screens/onboarding/WhyChooseVerityScreen';
import {
  RootStackParamList,
  TabParamList,
  CallsStackParamList,
  SettingsStackParamList,
} from './src/navigation/types';
import { rootNavigationRef } from './src/navigation/rootNavigator';
import { consumePendingSiriRoute as consumePendingSiriRouteNative } from './src/native/WidgetSnapshot';
import TwilioVoiceClientManager from './src/components/twilio/TwilioVoiceClientManager';
import { logEvent } from './src/services/sentry';
import { getPostHogClient } from './src/services/posthog';
import type { AppTheme } from './src/theme/tokens';
import { withOpacity } from './src/utils/color';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

enableScreens(true);

const GLOBAL_MAX_FONT_SIZE_MULTIPLIER = 1.2;

if (Text.defaultProps == null) {
  Text.defaultProps = {};
}
Text.defaultProps.allowFontScaling = true;
Text.defaultProps.maxFontSizeMultiplier = GLOBAL_MAX_FONT_SIZE_MULTIPLIER;

if (TextInput.defaultProps == null) {
  TextInput.defaultProps = {};
}
TextInput.defaultProps.allowFontScaling = true;
TextInput.defaultProps.maxFontSizeMultiplier = GLOBAL_MAX_FONT_SIZE_MULTIPLIER;

type PendingNotificationData = {
  callId?: string;
  alertId?: string;
  profileId?: string;
  supportTicketId?: string;
  supportMessageId?: string;
  alertsMode?: 'needs' | 'history';
  routeTarget?:
    | 'call_detail'
    | 'calls_all'
    | 'calls_trusted'
    | 'trusted_call_detail'
    | 'circle_activity'
    | 'alerts'
    | 'support_portal'
    | 'membership_billing'
    | 'membership_facility_offer'
    | 'nudge_test_call'
    | 'nudge_alert_prefs'
    | 'nudge_safe_phrases';
  facilityCode?: string;
  facilityToken?: string;
  facilitySlug?: string;
  alertType?: string;
};

const ACTIVITY_PUSH_CHANNEL_ID = 'activity-alerts';
const ACTIVITY_PUSH_SOUND = 'activity-notification.wav';
const SUPPORT_PUSH_CHANNEL_ID = 'support-updates';
const SUPPORT_PUSH_SOUND = 'support-notification.wav';
const CALL_DETAIL_ALERT_TYPES = new Set<string>(['fraud', 'safe', 'call_review']);
const PENDING_INVITE_ID_KEY = 'app:pending-invite-id';
const TRIAL_REMINDER_MODAL_LAST_SHOWN_AT_KEY = 'trial:reminder:last-shown-at';

function normalizeInviteIdentifier(value: string | null | undefined) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) {
    return null;
  }
  const cleaned = trimmed.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  if (cleaned.length === 8) {
    return `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`;
  }
  return trimmed;
}

function parseJsonRecord(value: unknown): Record<string, unknown> | null {
  if (!value) {
    return null;
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

function normalizeNotificationData(data: Record<string, unknown>) {
  const normalized: Record<string, unknown> = { ...data };
  const queue: Record<string, unknown>[] = [data];
  let depth = 0;

  while (queue.length > 0 && depth < 2) {
    const current = queue.shift();
    if (!current) {
      continue;
    }
    for (const key of ['data', 'payload', 'meta', 'metadata', 'notificationData']) {
      const nested = parseJsonRecord(current[key]);
      if (!nested) {
        continue;
      }
      Object.assign(normalized, nested);
      queue.push(nested);
    }
    depth += 1;
  }

  return normalized;
}

function parseRouteTarget(value: unknown): PendingNotificationData['routeTarget'] {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!normalized) {
    return undefined;
  }
  if (
    normalized === 'call_detail' ||
    normalized === 'calldetail' ||
    normalized === 'call-detail' ||
    normalized === 'call_details' ||
    normalized === 'calldetails' ||
    normalized === 'call-details' ||
    normalized === 'calldetailmodal' ||
    normalized === 'call_detail_modal' ||
    normalized === 'call-detail-modal'
  ) {
    return 'call_detail';
  }
  if (
    normalized === 'calls_all' ||
    normalized === 'callsall' ||
    normalized === 'calls-all' ||
    normalized === 'calls' ||
    normalized === 'call'
  ) {
    return 'calls_all';
  }
  if (
    normalized === 'calls_trusted' ||
    normalized === 'callstrusted' ||
    normalized === 'calls-trusted' ||
    normalized === 'trusted_calls' ||
    normalized === 'trusted-calls'
  ) {
    return 'calls_trusted';
  }
  if (
    normalized === 'trusted_call_detail' ||
    normalized === 'trustedcalldetail' ||
    normalized === 'trusted-call-detail'
  ) {
    return 'trusted_call_detail';
  }
  if (
    normalized === 'circle_activity' ||
    normalized === 'circleactivity' ||
    normalized === 'circle-activity' ||
    normalized === 'circle'
  ) {
    return 'circle_activity';
  }
  if (normalized === 'alerts' || normalized === 'alert') {
    return 'alerts';
  }
  if (
    normalized === 'support_portal' ||
    normalized === 'supportportal' ||
    normalized === 'support-portal'
  ) {
    return 'support_portal';
  }
  if (
    normalized === 'membership_billing' ||
    normalized === 'membershipbilling' ||
    normalized === 'membership-billing' ||
    normalized === 'billing' ||
    normalized === 'subscription' ||
    normalized === 'subscriptions'
  ) {
    return 'membership_billing';
  }
  if (
    normalized === 'membership_facility_offer' ||
    normalized === 'membership-facility-offer' ||
    normalized === 'membershipfacilityoffer' ||
    normalized === 'facility_offer' ||
    normalized === 'facility-offer' ||
    normalized === 'facilityoffer'
  ) {
    return 'membership_facility_offer';
  }
  if (
    normalized === 'nudge_test_call' ||
    normalized === 'nudge-test-call' ||
    normalized === 'nudge:test_call' ||
    normalized === 'test_call' ||
    normalized === 'test-call'
  ) {
    return 'nudge_test_call';
  }
  if (
    normalized === 'nudge_alert_prefs' ||
    normalized === 'nudge-alert-prefs' ||
    normalized === 'nudge:alert_prefs' ||
    normalized === 'alert_prefs' ||
    normalized === 'alert-prefs' ||
    normalized === 'alert_preferences'
  ) {
    return 'nudge_alert_prefs';
  }
  if (
    normalized === 'nudge_safe_phrases' ||
    normalized === 'nudge-safe-phrases' ||
    normalized === 'nudge:safe_phrases' ||
    normalized === 'safe_phrases' ||
    normalized === 'safe-phrases'
  ) {
    return 'nudge_safe_phrases';
  }
  return undefined;
}

function parseAlertsMode(value: unknown): PendingNotificationData['alertsMode'] {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!normalized) {
    return undefined;
  }
  if (
    normalized === 'needs' ||
    normalized === 'needs_attention' ||
    normalized === 'needs-attention' ||
    normalized === 'attention'
  ) {
    return 'needs';
  }
  if (
    normalized === 'history' ||
    normalized === 'handled' ||
    normalized === 'archive' ||
    normalized === 'archived'
  ) {
    return 'history';
  }
  return undefined;
}

function readDataString(
  data: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

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

function inferRouteTargetFromPayload(args: {
  callId?: string;
  alertId?: string;
  alertType?: string;
  hasSupportTicketData: boolean;
}): PendingNotificationData['routeTarget'] {
  const { callId, alertId, alertType, hasSupportTicketData } = args;
  const normalizedAlertType = (alertType ?? '').trim().toLowerCase();

  if (hasSupportTicketData) {
    return 'support_portal';
  }
  if (callId) {
    return 'call_detail';
  }
  if (normalizedAlertType === 'trusted') {
    return alertId ? 'trusted_call_detail' : 'calls_trusted';
  }
  if (CIRCLE_ALERT_TYPES.has(normalizedAlertType)) {
    return 'circle_activity';
  }
  if (alertId || normalizedAlertType) {
    return 'alerts';
  }
  return undefined;
}

function parseNotificationPayload(data: Record<string, unknown>): PendingNotificationData {
  const normalizedData = normalizeNotificationData(data);
  const parsedRoutePayload = parseWidgetRoutePayload(
    readDataString(
      normalizedData,
      'deepLink',
      'deep_link',
      'deeplink',
      'url',
      'link',
      'routeTarget',
      'route_target',
      'route',
      'screen',
      'target'
    ) ?? ''
  );
  const callId =
    readDataString(
      normalizedData,
      'callId',
      'call_id',
      'callID',
      'call-id',
      'callUuid',
      'call_uuid'
    ) ?? parsedRoutePayload?.callId;
  const alertId = readDataString(normalizedData, 'alertId', 'alert_id', 'alertID', 'alert-id');
  const alertType = readDataString(
    normalizedData,
    'alertType',
    'alert_type',
    'type',
    'notificationType',
    'notification_type',
    'category'
  );
  const alertsMode =
    parseAlertsMode(
      readDataString(
        normalizedData,
        'alertsMode',
        'alerts_mode',
        'initialMode',
        'initial_mode'
      )
    ) ?? parsedRoutePayload?.alertsMode;
  const supportTicketId = readDataString(
    normalizedData,
    'supportTicketId',
    'support_ticket_id',
    'ticketId',
    'ticket_id'
  );
  const supportMessageId = readDataString(
    normalizedData,
    'supportMessageId',
    'support_message_id',
    'messageId',
    'message_id'
  );
  const profileId = readDataString(
    normalizedData,
    'profileId',
    'profile_id',
    'profileID',
    'profile-id'
  );
  const parsedRoute =
    parseRouteTarget(
      readDataString(
        normalizedData,
        'routeTarget',
        'route_target',
        'route',
        'screen',
        'target'
      )
    ) ?? parsedRoutePayload?.routeTarget;
  const facilityCode =
    readDataString(normalizedData, 'facilityCode', 'facility_code', 'code') ??
    parsedRoutePayload?.facilityCode;
  const facilityToken =
    readDataString(normalizedData, 'facilityToken', 'facility_token', 'claimToken', 'claim_token', 't') ??
    parsedRoutePayload?.facilityToken;
  const facilitySlug =
    readDataString(normalizedData, 'facilitySlug', 'facility_slug', 'facility') ??
    parsedRoutePayload?.facilitySlug;

  const routeTarget =
    parsedRoute ??
    inferRouteTargetFromPayload({
      callId,
      alertId,
      alertType,
      hasSupportTicketData: Boolean(supportTicketId || supportMessageId),
    });

  return {
    callId,
    alertId,
    alertType,
    alertsMode,
    routeTarget,
    supportTicketId,
    supportMessageId,
    profileId,
    facilityCode,
    facilityToken,
    facilitySlug,
  };
}

function parseWidgetRoutePayload(url: string): PendingNotificationData | null {
  if (!url.trim()) {
    return null;
  }
  const parsed = Linking.parse(url);
  const combinedPath = [parsed.hostname, parsed.path].filter(Boolean).join('/');
  const path = combinedPath.trim().replace(/^\/+|\/+$/g, '');
  if (!path) {
    return null;
  }
  const segments = path.split('/').filter(Boolean);
  const normalizedSegments = segments.map((segment) => segment.trim().toLowerCase());
  const [firstSegment, secondSegment] = normalizedSegments;
  const secondSegmentRaw = segments[1]?.trim();
  if (!firstSegment) {
    return null;
  }
  const queryFacilityCode = parsed.queryParams?.code;
  const facilityCode =
    typeof queryFacilityCode === 'string'
      ? queryFacilityCode.trim()
      : Array.isArray(queryFacilityCode)
      ? queryFacilityCode[0]?.trim()
      : undefined;
  const queryFacilityToken = parsed.queryParams?.t ?? parsed.queryParams?.token;
  const facilityToken =
    typeof queryFacilityToken === 'string'
      ? queryFacilityToken.trim()
      : Array.isArray(queryFacilityToken)
      ? queryFacilityToken[0]?.trim()
      : undefined;
  const queryFacilitySlug = parsed.queryParams?.facility ?? parsed.queryParams?.facility_slug;
  const facilitySlugFromQuery =
    typeof queryFacilitySlug === 'string'
      ? queryFacilitySlug.trim()
      : Array.isArray(queryFacilitySlug)
      ? queryFacilitySlug[0]?.trim()
      : undefined;

  if (
    (firstSegment === 'membership' || firstSegment === 'subscription' || firstSegment === 'subscriptions') &&
    (secondSegment === 'facility' || secondSegment === 'partner')
  ) {
    return {
      routeTarget: 'membership_facility_offer',
      facilityCode,
      facilityToken,
      facilitySlug: facilitySlugFromQuery,
    };
  }
  if (firstSegment === 'facility' || firstSegment === 'partner') {
    return {
      routeTarget: 'membership_facility_offer',
      facilityCode,
      facilityToken,
      facilitySlug: secondSegmentRaw ?? facilitySlugFromQuery,
    };
  }

  if (firstSegment === 'alerts') {
    const modeParam = parsed.queryParams?.mode;
    const modeValue =
      typeof modeParam === 'string'
        ? modeParam
        : Array.isArray(modeParam)
        ? modeParam[0]
        : '';
    const parsedMode = parseAlertsMode(modeValue) ?? parseAlertsMode(secondSegment);
    return { routeTarget: 'alerts', alertsMode: parsedMode };
  }
  if (
    firstSegment === 'support' ||
    firstSegment === 'supportportal' ||
    firstSegment === 'support-portal' ||
    firstSegment === 'supportchat' ||
    firstSegment === 'support-chat'
  ) {
    return { routeTarget: 'support_portal' };
  }
  if (
    firstSegment === 'billing' ||
    firstSegment === 'membership' ||
    firstSegment === 'subscription' ||
    firstSegment === 'subscriptions'
  ) {
    return { routeTarget: 'membership_billing' };
  }
  if (firstSegment === 'nudge') {
    if (secondSegment === 'test_call' || secondSegment === 'test-call') {
      return { routeTarget: 'nudge_test_call' };
    }
    if (
      secondSegment === 'alert_prefs' ||
      secondSegment === 'alert-prefs' ||
      secondSegment === 'alert_preferences'
    ) {
      return { routeTarget: 'nudge_alert_prefs' };
    }
    if (secondSegment === 'safe_phrases' || secondSegment === 'safe-phrases') {
      return { routeTarget: 'nudge_safe_phrases' };
    }
    return null;
  }
  if (
    firstSegment === 'call' ||
    firstSegment === 'calldetail' ||
    firstSegment === 'call-detail' ||
    firstSegment === 'call_detail' ||
    firstSegment === 'call-details' ||
    firstSegment === 'call_details'
  ) {
    const callParam = parsed.queryParams?.callId ?? parsed.queryParams?.call_id;
    const callId =
      typeof callParam === 'string'
        ? callParam.trim()
        : Array.isArray(callParam)
        ? callParam[0]?.trim()
        : secondSegmentRaw;
    if (callId) {
      return { routeTarget: 'call_detail', callId };
    }
    return { routeTarget: 'calls_all' };
  }
  if (firstSegment === 'calls') {
    const filterParam = parsed.queryParams?.filter;
    const filterValue =
      typeof filterParam === 'string'
        ? filterParam
        : Array.isArray(filterParam)
        ? filterParam[0]
        : '';
    if (filterValue.trim().toLowerCase() === 'trusted') {
      return { routeTarget: 'calls_trusted' };
    }
    if (secondSegment?.trim().toLowerCase() === 'trusted') {
      return { routeTarget: 'calls_trusted' };
    }
    if (
      secondSegmentRaw &&
      secondSegment !== 'all' &&
      secondSegment !== 'list' &&
      secondSegment !== 'history'
    ) {
      return { routeTarget: 'call_detail', callId: secondSegmentRaw };
    }
    return { routeTarget: 'calls_all' };
  }
  return null;
}

const RootStack = createStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();
const CallsStack = createStackNavigator<CallsStackParamList>();
const SettingsStack = createStackNavigator<SettingsStackParamList>();

function CallsStackNavigator() {
  return (
    <CallsStack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <CallsStack.Screen name="Calls" component={CallsScreen} />
      <CallsStack.Screen
        name="CallDetail"
        component={CallDetailScreen}
      />
    </CallsStack.Navigator>
  );
}

function SettingsStackNavigator() {
  return (
      <SettingsStack.Navigator
        screenOptions={{
          headerShown: false,
        }}
      >
      <SettingsStack.Screen name="Settings" component={SettingsScreen} />
      <SettingsStack.Screen name="Account" component={AccountScreen} />
      <SettingsStack.Screen name="MembershipBilling" component={MembershipBillingScreen} />
      <SettingsStack.Screen name="Notifications" component={NotificationsScreen} />
      <SettingsStack.Screen name="Security" component={SecurityScreen} />
      <SettingsStack.Screen name="ChangePasscode" component={ChangePasscodeScreen} />
      <SettingsStack.Screen
        name="SafePhrases"
        component={SafePhrasesScreen}
      />
      <SettingsStack.Screen
        name="TrustedContacts"
        component={TrustedContactsScreen}
      />
      <SettingsStack.Screen name="Blocklist" component={BlocklistScreen} />
      <SettingsStack.Screen name="DataPrivacy" component={DataPrivacyScreen} />
      <SettingsStack.Screen name="Automation" component={AutomationScreen} />
      <SettingsStack.Screen
        name="EnterInviteCode"
        component={EnterInviteCodeScreen}
      />
      <SettingsStack.Screen name="Members" component={MembersScreen} />
      <SettingsStack.Screen name="SupportInfo" component={SupportInfoScreen} />
      <SettingsStack.Screen name="HowItWorks" component={HowItWorksScreen} />
      <SettingsStack.Screen name="SafetyIntelligence" component={DoctorLookupScreen} />
    </SettingsStack.Navigator>
  );
}

function parseInviteIdFromUrl(url: string) {
  const parsed = Linking.parse(url);
  const combinedPath = [parsed.hostname, parsed.path].filter(Boolean).join('/');
  const segments = combinedPath
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);
  const normalizedSegments = segments.map((segment) => segment.toLowerCase());
  const inviteIndex = normalizedSegments.findIndex(
    (segment) => segment === 'invite' || segment === 'invites'
  );
  if (inviteIndex >= 0 && segments.length > inviteIndex + 1) {
    return normalizeInviteIdentifier(segments[inviteIndex + 1]);
  }
  const queryInviteId = parsed.queryParams?.inviteId ?? parsed.queryParams?.invite_id;
  if (typeof queryInviteId === 'string' && queryInviteId.trim().length > 0) {
    return normalizeInviteIdentifier(queryInviteId);
  }
  if (Array.isArray(queryInviteId) && queryInviteId[0]?.trim()) {
    return normalizeInviteIdentifier(queryInviteId[0]);
  }
  return null;
}

function InviteLinkHandler() {
  const { session } = useAuth();
  const { profiles, refreshProfiles, setActiveProfile } = useProfile();
  const pendingInviteRef = useRef<string | null>(null);
  const isAcceptingInviteRef = useRef(false);
  const acceptedProfileIdRef = useRef<string | null>(null);

  const persistPendingInvite = useCallback(async (inviteId: string) => {
    try {
      await AsyncStorage.setItem(PENDING_INVITE_ID_KEY, inviteId);
    } catch {
      // Best effort persistence.
    }
  }, []);

  const clearPendingInvite = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(PENDING_INVITE_ID_KEY);
    } catch {
      // Best effort cleanup.
    }
  }, []);

  const activateAcceptedProfile = useCallback(
    (profileId?: string) => {
      const targetProfileId = profileId ?? acceptedProfileIdRef.current;
      if (!targetProfileId) {
        return;
      }
      const acceptedProfile = profiles.find((profile) => profile.id === targetProfileId);
      if (acceptedProfile) {
        setActiveProfile(acceptedProfile);
        acceptedProfileIdRef.current = null;
      }
    },
    [profiles, setActiveProfile]
  );

  const acceptInvite = useCallback(
    async (inviteId: string) => {
      if (isAcceptingInviteRef.current) {
        return;
      }
      const normalizedInviteId = normalizeInviteIdentifier(inviteId) ?? inviteId.trim();
      if (!normalizedInviteId) {
        return;
      }
      isAcceptingInviteRef.current = true;
      try {
        const response = await authorizedFetch(`/profiles/invites/${normalizedInviteId}/accept`, {
          method: 'POST',
        });
        const acceptedProfileId =
          typeof response?.member?.profile_id === 'string'
            ? response.member.profile_id
            : undefined;
        acceptedProfileIdRef.current = acceptedProfileId ?? null;
        pendingInviteRef.current = null;
        await clearPendingInvite();
        await refreshProfiles();
        activateAcceptedProfile(acceptedProfileId);
        Alert.alert('Invite accepted', 'You now have access to the shared profile.');
      } catch (err) {
        console.error('Failed to accept invite', err);
      } finally {
        isAcceptingInviteRef.current = false;
      }
    },
    [activateAcceptedProfile, clearPendingInvite, refreshProfiles]
  );

  const handleUrl = useCallback(
    async (url: string) => {
      const inviteId = parseInviteIdFromUrl(url);
      if (!inviteId) {
        return;
      }
      if (!session) {
        pendingInviteRef.current = inviteId;
        await persistPendingInvite(inviteId);
        return;
      }
      await acceptInvite(inviteId);
    },
    [acceptInvite, persistPendingInvite, session]
  );

  useEffect(() => {
    const subscription = Linking.addEventListener('url', (event) => handleUrl(event.url));
    Linking.getInitialURL().then((url) => {
      if (url) {
        handleUrl(url);
      }
    });
    return () => subscription.remove();
  }, [handleUrl]);

  useEffect(() => {
    let isMounted = true;
    const hydratePendingInvite = async () => {
      try {
        const storedInviteId = await AsyncStorage.getItem(PENDING_INVITE_ID_KEY);
        if (!isMounted || !storedInviteId?.trim()) {
          return;
        }
        pendingInviteRef.current = storedInviteId.trim();
      } catch {
        // Best effort hydration.
      }
      if (session && pendingInviteRef.current) {
        await acceptInvite(pendingInviteRef.current);
      }
    };
    hydratePendingInvite();
    return () => {
      isMounted = false;
    };
  }, [acceptInvite, session]);

  useEffect(() => {
    activateAcceptedProfile();
  }, [activateAcceptedProfile]);

  return null;
}

function AppTabs() {
  const insets = useSafeAreaInsets();
  const dockBottom = 0;
  const dockHeight = 96 + Math.max(insets.bottom, 16);
  const { redirectToSettings, setRedirectToSettings } = useProfile();
  const initialRoute = redirectToSettings ? 'SettingsTab' : 'HomeTab';

  useEffect(() => {
    if (!redirectToSettings) {
      return;
    }
    setRedirectToSettings(false);
  }, [redirectToSettings, setRedirectToSettings]);

  return (
    <AlertProvider>
      <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        animation: 'none',
      }}
      tabBar={(props) => (
        <BottomDock
          {...props}
          dockHeight={dockHeight}
          containerStyle={{ bottom: dockBottom }}
        />
      )}
      initialRouteName={initialRoute}
    >
      <Tab.Screen name="HomeTab" component={HomeScreen} options={{ title: 'Home' }} />
      <Tab.Screen name="CallsTab" component={CallsStackNavigator} options={{ title: 'Calls' }} />
      <Tab.Screen
        name="AlertsTab"
        component={AlertsScreen}
        options={{ title: 'Alerts' }}
      />
      <Tab.Screen
        name="SettingsTab"
        component={SettingsStackNavigator}
        options={{ title: 'Settings' }}
      />
      </Tab.Navigator>
    </AlertProvider>
  );
}

function RootNavigator() {
  const { session } = useAuth();
  const { onboardingComplete, authInvalid } = useProfile();
  const {
    status: subscriptionStatus,
    hasResolvedStatus,
    isProcessingPurchase,
    membershipActivationNotice,
  } = useSubscription();
  const shouldRequireMembership = Boolean(
    subscriptionStatus?.requiresPaidMembership && !subscriptionStatus?.hasActiveSubscription
  );

  const shouldHoldMembershipRouting = Boolean(
    session &&
      !authInvalid &&
      (!hasResolvedStatus || (isProcessingPurchase && shouldRequireMembership))
  );

  if (shouldHoldMembershipRouting) {
    return <SplashScreen persistent />;
  }

  return (
    <RootStack.Navigator>
      {session && !authInvalid ? (
        shouldRequireMembership ? (
          <>
            <RootStack.Screen
              name="Membership"
              component={MembershipScreen}
              options={{ headerShown: false }}
            />
            <RootStack.Screen
              name="MembershipActivated"
              component={MembershipActivatedScreen}
              options={{ headerShown: false }}
            />
            <RootStack.Screen
              name="OnboardingInviteCode"
              component={OnboardingInviteCodeScreen}
              options={{ headerShown: false }}
            />
            <RootStack.Screen
              name="SupportPortal"
              component={SupportTicketsScreen}
              options={{ headerShown: false, presentation: 'modal' }}
            />
            <RootStack.Screen
              name="SupportModal"
              component={SupportScreen}
              options={{ headerShown: false, presentation: 'modal' }}
            />
            <RootStack.Screen
              name="SupportResource"
              component={SupportResourceScreen}
              options={{ headerShown: false, presentation: 'modal' }}
            />
          </>
        ) : !onboardingComplete ? (
          <>
            {membershipActivationNotice ? (
              <>
                <RootStack.Screen
                  name="MembershipActivated"
                  component={MembershipActivatedScreen}
                  options={{ headerShown: false }}
                />
                <RootStack.Screen
                  name="OnboardingChoice"
                  component={OnboardingChoiceScreen}
                  options={{ headerShown: false }}
                />
              </>
            ) : (
              <RootStack.Screen
                name="OnboardingChoice"
                component={OnboardingChoiceScreen}
                options={{ headerShown: false }}
              />
            )}
            <RootStack.Screen
              name="OnboardingProfile"
              component={CreateProfileScreen}
              options={{ headerShown: false }}
            />
            <RootStack.Screen
              name="OnboardingPasscode"
              component={PasscodeScreen}
              options={{ headerShown: false, animation: 'none' }}
            />
            <RootStack.Screen
              name="OnboardingCallForwarding"
              component={OnboardingCallForwardingScreen}
              options={{ title: 'Call Forwarding' }}
            />
            <RootStack.Screen
              name="OnboardingTrustedContacts"
              component={OnboardingTrustedContactsScreen}
              options={{ headerShown: false }}
            />
            <RootStack.Screen
              name="OnboardingInviteFamily"
              component={InviteFamilyScreen}
              options={{ headerShown: false }}
            />
            <RootStack.Screen
              name="OnboardingInviteCode"
              component={OnboardingInviteCodeScreen}
              options={{ headerShown: false }}
            />
            <RootStack.Screen
              name="SupportPortal"
              component={SupportTicketsScreen}
              options={{ headerShown: false, presentation: 'modal' }}
            />
            <RootStack.Screen
              name="SupportModal"
              component={SupportScreen}
              options={{ headerShown: false, presentation: 'modal' }}
            />
            <RootStack.Screen
              name="SupportResource"
              component={SupportResourceScreen}
              options={{ headerShown: false, presentation: 'modal' }}
            />
          </>
        ) : (
          <>
            <RootStack.Screen
              name="AppTabs"
              component={AppTabs}
              options={{ headerShown: false }}
            />
            <RootStack.Screen
              name="CallDetailModal"
              component={CallDetailScreen}
              options={{ headerShown: false, presentation: 'modal' }}
            />
            <RootStack.Screen
              name="TrustedCallDetail"
              component={TrustedCallDetailScreen}
              options={{ headerShown: false, presentation: 'modal' }}
            />
            <RootStack.Screen
              name="WhatsNew"
              component={WhatsNewScreen}
              options={{ headerShown: false, presentation: 'modal' }}
            />
            <RootStack.Screen
              name="CircleActivityDetail"
              component={CircleActivityDetailScreen}
              options={{ headerShown: false, presentation: 'modal' }}
            />
            <RootStack.Screen
              name="SupportPortal"
              component={SupportTicketsScreen}
              options={{ headerShown: false, presentation: 'modal' }}
            />
            <RootStack.Screen
              name="SupportModal"
              component={SupportScreen}
              options={{ headerShown: false, presentation: 'modal' }}
            />
            <RootStack.Screen
              name="SupportResource"
              component={SupportResourceScreen}
              options={{ headerShown: false, presentation: 'modal' }}
            />
            <RootStack.Screen
              name="CircleActivityModal"
              component={CircleActivityScreen}
              options={{ headerShown: false, presentation: 'modal' }}
            />
          </>
        )
      ) : (
        <>
          <RootStack.Screen
            name="SignIn"
            component={SignInScreen}
            options={{ headerShown: false, animation: 'none' }}
          />
          <RootStack.Screen
            name="SignUp"
            component={SignUpScreen}
            options={{ headerShown: false, animation: 'none' }}
          />
          <RootStack.Screen
            name="ConfirmEmail"
            component={ConfirmEmailScreen}
            options={{ headerShown: false, animation: 'none' }}
          />
          <RootStack.Screen
            name="ResetPassword"
            component={ResetPasswordScreen}
            options={{ headerShown: false, animation: 'none' }}
          />
        </>
      )}
      {/* Success screen available for smooth transition after onboarding */}
      <RootStack.Screen
        name="OnboardingSuccess"
        component={OnboardingSuccessScreen}
        options={{ headerShown: false, gestureEnabled: false }}
      />
      <RootStack.Screen
        name="PermissionPriming"
        component={PermissionPrimingScreen}
        options={{ headerShown: false, gestureEnabled: false }}
      />
      <RootStack.Screen
        name="OnboardingSafePhrases"
        component={OnboardingSafePhrasesScreen}
        options={{ headerShown: false }}
      />
      <RootStack.Screen
        name="OnboardingAlerts"
        component={AlertPrefsScreen}
        options={{ headerShown: false }}
      />
      <RootStack.Screen
        name="OnboardingTestCall"
        component={TestCallScreen}
        options={{ title: 'Test Call' }}
      />
      <RootStack.Screen
        name="MembershipFacilityOffer"
        component={MembershipFacilityOfferScreen}
        options={{ headerShown: false, presentation: 'modal' }}
      />
      <RootStack.Screen
        name="MembershipExperience"
        component={MembershipExperienceScreen}
        options={{ headerShown: false, presentation: 'modal' }}
      />
      <RootStack.Screen
        name="WhyChooseVerity"
        component={WhyChooseVerityScreen}
        options={{ headerShown: false, presentation: 'modal' }}
      />
      <RootStack.Screen
        name="ActiveCallModal"
        component={ActiveCallScreen}
        options={{ headerShown: false, presentation: 'modal' }}
      />
    </RootStack.Navigator>
  );
}

function AuthCallbackHandler() {
  const handleUrl = useCallback(async (url: string) => {
    if (!url) {
      return;
    }
    console.log('=== AuthCallbackHandler START ===');
    console.log('Full URL received:', url);
    
    const parsed = Linking.parse(url);
    console.log('Parsed path:', parsed.path);
    console.log('Parsed hostname:', parsed.hostname);
    console.log('Parsed queryParams:', JSON.stringify(parsed.queryParams, null, 2));
    
    if (parsed.path?.endsWith('auth/callback') || parsed.path?.includes('auth/callback')) {
      const params = parsed.queryParams ?? {};
      console.log('Auth callback detected!');
      console.log('All params keys:', Object.keys(params));
      
      const toStringParam = (val?: string | string[]) => {
        if (typeof val === 'string') return val;
        if (Array.isArray(val)) return val[0];
        return undefined;
      };

      const urlObject = (() => {
        try {
          return new URL(url);
        } catch {
          return null;
        }
      })();
      const queryParams = urlObject?.searchParams ?? new URLSearchParams();
      const hashParams = new URLSearchParams(urlObject?.hash?.replace(/^#/, '') ?? '');
      const readParam = (...keys: string[]) => {
        for (const key of keys) {
          const fromParsed = toStringParam((params as Record<string, string | string[] | undefined>)[key]);
          if (fromParsed?.trim()) {
            return fromParsed.trim();
          }
          const fromQuery = queryParams.get(key);
          if (fromQuery?.trim()) {
            return fromQuery.trim();
          }
          const fromHash = hashParams.get(key);
          if (fromHash?.trim()) {
            return fromHash.trim();
          }
        }
        return undefined;
      };

      const mode = readParam('mode');
      const source = readParam('source');
      const isReset = mode === 'reset' || source === 'password';
      if (isReset) {
        console.log('Reset password flow detected');
        rootNavigationRef.current?.navigate('ResetPassword');
        return;
      }

      const code = readParam('code');
      const codeVerifier = readParam('code_verifier');
      const accessToken = readParam('access_token');
      const refreshToken = readParam('refresh_token');
      const tokenHash = readParam('token_hash');
      const token = readParam('token');
      const type = readParam('type');
      const confirmedParam = readParam('confirmed');
      const emailParam = readParam('email');
      
      console.log('=== PKCE EXTRACTION ===');
      console.log('code:', code ? `${code.substring(0, 20)}...` : 'MISSING');
      console.log('code_verifier:', codeVerifier ? `${codeVerifier.substring(0, 20)}...` : 'MISSING');
      console.log('code length:', code?.length ?? 0);
      console.log('verifier length:', codeVerifier?.length ?? 0);

      let callbackSession: Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session'] | null = null;

      if (accessToken && refreshToken) {
        try {
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) {
            console.warn('setSession error in callback', error.message);
          } else {
            callbackSession = data.session ?? null;
          }
        } catch (error) {
          console.warn('setSession exception in callback', error);
        }
      } else if (tokenHash && type) {
        try {
          const normalizedType = type.toLowerCase();
          const allowedOtpTypes = new Set(['signup', 'email', 'email_change', 'recovery', 'invite']);
          if (allowedOtpTypes.has(normalizedType)) {
            const { data, error } = await supabase.auth.verifyOtp({
              token_hash: tokenHash,
              type: normalizedType as 'signup' | 'email' | 'email_change' | 'recovery' | 'invite',
            });
            if (error) {
              console.warn('verifyOtp error in callback', error.message);
            } else {
              callbackSession = data.session ?? null;
            }
          }
        } catch (error) {
          console.warn('verifyOtp exception in callback', error);
        }
      } else if (code && codeVerifier) {
        try {
          console.log('=== ATTEMPTING CODE EXCHANGE ===');
          
          // Supabase needs the URL in a specific format - reconstruct as https callback URL
          const callbackUrl = new URL('https://verityprotect.com/auth/callback');
          callbackUrl.searchParams.set('code', code);
          callbackUrl.searchParams.set('code_verifier', codeVerifier);
          
          console.log('Calling exchangeCodeForSession...');
          
          const { data, error } = await supabase.auth.exchangeCodeForSession(callbackUrl.toString());
          if (error) {
            console.error('=== EXCHANGE FAILED ===');
            console.error('Error:', error.message);
            console.error('Error details:', error);
          } else {
            console.log('=== EXCHANGE SUCCESS ===');
            console.log('Has session:', !!data.session);
            console.log('User email:', data.session?.user?.email);
            console.log('Email confirmed:', !!data.session?.user?.email_confirmed_at);
            callbackSession = data.session ?? null;
          }
        } catch (error) {
          console.error('=== EXCHANGE EXCEPTION ===');
          console.error('Exception:', error);
        }
      } else {
        console.warn('=== SKIPPING EXCHANGE ===');
        console.warn('Missing required params - code:', !!code, 'verifier:', !!codeVerifier);
      }

      if (!callbackSession) {
        try {
          const { data } = await supabase.auth.getSession();
          callbackSession = data.session ?? null;
        } catch {
          callbackSession = null;
        }
      }

      const confirmedFlagFromParam =
        confirmedParam === 'true' ||
        confirmedParam === '1' ||
        confirmedParam === 'yes';
      const isConfirmation =
        Boolean(callbackSession?.user?.email_confirmed_at) ||
        type === 'signup' ||
        type === 'email' ||
        !!tokenHash ||
        !!token ||
        source === 'confirmation' ||
        confirmedFlagFromParam ||
        Boolean(code && codeVerifier);
      const payload: { confirmed?: boolean; email?: string } = {
        confirmed: !!isConfirmation,
        email: emailParam ?? callbackSession?.user?.email ?? undefined,
      };
      console.log('=== NAVIGATING ===');
      console.log('Payload:', payload);
      
      const currentRoute = rootNavigationRef.current?.getCurrentRoute();
      if (currentRoute?.name === 'ConfirmEmail') {
        console.log('Updating existing ConfirmEmail screen params');
        rootNavigationRef.current?.dispatch(CommonActions.setParams(payload));
      } else {
        console.log('Navigating to ConfirmEmail screen');
        rootNavigationRef.current?.navigate('ConfirmEmail', payload);
      }
      console.log('=== AuthCallbackHandler END ===');
    }
  }, []);

  useEffect(() => {
    const subscription = Linking.addEventListener('url', (event) => handleUrl(event.url));
    Linking.getInitialURL().then((initialUrl) => {
      handleUrl(initialUrl ?? '');
    });
    return () => subscription.remove();
  }, [handleUrl]);

  return null;
}

type SessionExpiredModalProps = {
  visible: boolean;
  theme: AppTheme;
  mode: string;
  onDismiss: () => void;
};

function SessionExpiredModal({ visible, theme, mode, onDismiss }: SessionExpiredModalProps) {
  const isDark = mode === 'dark';
  const cardBg = theme.colors.surface;
  const overlayBg = isDark ? 'rgba(0,0,0,0.72)' : 'rgba(15,23,42,0.55)';

  const handleOk = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onDismiss();
  }, [onDismiss]);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: overlayBg, justifyContent: 'center', paddingHorizontal: 28 }}>
        <View style={{
          backgroundColor: cardBg,
          borderRadius: 28,
          padding: 28,
          gap: 20,
          alignItems: 'center',
          shadowColor: '#000',
          shadowOpacity: isDark ? 0.45 : 0.18,
          shadowRadius: 28,
          shadowOffset: { width: 0, height: 14 },
          elevation: 16,
        }}>
          {/* Icon */}
          <View style={{
            width: 56, height: 56, borderRadius: 18,
            backgroundColor: withOpacity(theme.colors.warning, 0.12),
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Ionicons name="lock-closed" size={26} color={theme.colors.warning} />
          </View>

          {/* Copy */}
          <View style={{ gap: 6, alignItems: 'center' }}>
            <Text style={{ fontSize: 20, fontWeight: '700', color: theme.colors.text, textAlign: 'center' }}>
              You were signed out
            </Text>
            <Text style={{ fontSize: 14, lineHeight: 20, color: theme.colors.textMuted, textAlign: 'center' }}>
              Your session ended automatically for your security. Sign back in to pick up where you left off.
            </Text>
          </View>

          {/* OK button */}
          <Pressable
            style={({ pressed }) => ({
              width: '100%', height: 50, borderRadius: 16,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: theme.colors.accent,
              opacity: pressed ? 0.75 : 1,
            })}
            onPress={handleOk}
          >
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>Got it</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function NavigationHost() {
  const { mode, theme } = useTheme();
  const { session, isLoading, sessionExpired, clearSessionExpired } = useAuth();

  // Debounce the modal — only show after sessionExpired has been stable for
  // 500ms. This prevents a brief flash during account deletion where the
  // SIGNED_OUT event fires before our intentional-sign-out guard can take effect.
  const [showSessionExpired, setShowSessionExpired] = useState(false);
  useEffect(() => {
    if (!sessionExpired || session) {
      setShowSessionExpired(false);
      return;
    }
    const t = setTimeout(() => setShowSessionExpired(true), 500);
    return () => clearTimeout(t);
  }, [sessionExpired, session]);
  const {
    status: subscriptionStatus,
    isLoadingStatus: subscriptionLoading,
    hasResolvedStatus: hasResolvedSubscriptionStatus,
  } = useSubscription();
  const {
    onboardingComplete,
    isLoading: profileLoading,
    resolvedSessionKey,
    authInvalid,
    profiles,
    activeProfile,
    setActiveProfile,
    canManageProfile,
  } = useProfile();
  const pendingNotificationRef = useRef<PendingNotificationData | null>(null);
  const notificationListenerRef = useRef<Notifications.Subscription | null>(null);
  const isResolvingNotificationRef = useRef(false);
  const notificationRetryCountRef = useRef<Record<string, number>>({});
  const [showTrialReminder, setShowTrialReminder] = useState(false);
  const [trialReminderDaysLeft, setTrialReminderDaysLeft] = useState(0);
  const trialReminderStorageKey = useMemo(() => {
    const userId = session?.user?.id?.trim();
    if (!userId) {
      return TRIAL_REMINDER_MODAL_LAST_SHOWN_AT_KEY;
    }
    return `${TRIAL_REMINDER_MODAL_LAST_SHOWN_AT_KEY}:${userId}`;
  }, [session?.user?.id]);

  const trialReminderEligibility = useMemo(() => {
    const subscription = subscriptionStatus?.subscription;
    if (!subscriptionStatus?.hasActiveSubscription || !subscription) {
      return { eligible: false, daysLeft: null as number | null };
    }
    if (!subscription.trialEndsAt || subscription.trialConvertedAt) {
      return { eligible: false, daysLeft: null as number | null };
    }
    const trialEndsAt = Date.parse(subscription.trialEndsAt);
    if (!Number.isFinite(trialEndsAt)) {
      return { eligible: false, daysLeft: null as number | null };
    }
    const msLeft = trialEndsAt - Date.now();
    if (msLeft < 0) {
      return { eligible: false, daysLeft: null as number | null };
    }
    const daysLeft = Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000)));
    if (daysLeft > 2) {
      return { eligible: false, daysLeft: null as number | null };
    }
    return { eligible: true, daysLeft };
  }, [subscriptionStatus]);

  useEffect(() => {
    if (
      !session ||
      !onboardingComplete ||
      !hasResolvedSubscriptionStatus ||
      subscriptionLoading ||
      !trialReminderEligibility.eligible
    ) {
      setShowTrialReminder(false);
      return;
    }

    let isCancelled = false;
    const maybeShow = async () => {
      try {
        const lastShownRaw = await AsyncStorage.getItem(trialReminderStorageKey);
        const lastShownMs = Number(lastShownRaw);
        if (Number.isFinite(lastShownMs) && Date.now() - lastShownMs < 24 * 60 * 60 * 1000) {
          return;
        }
      } catch {
        // best effort
      }

      if (isCancelled) {
        return;
      }
      setTrialReminderDaysLeft(trialReminderEligibility.daysLeft ?? 0);
      setShowTrialReminder(true);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => null);
    };

    void maybeShow();

    return () => {
      isCancelled = true;
    };
  }, [
    hasResolvedSubscriptionStatus,
    onboardingComplete,
    session,
    subscriptionLoading,
    trialReminderEligibility.daysLeft,
    trialReminderEligibility.eligible,
    trialReminderStorageKey,
  ]);

  const dismissTrialReminder = useCallback(() => {
    setShowTrialReminder(false);
    void AsyncStorage.setItem(trialReminderStorageKey, String(Date.now())).catch(() => null);
  }, [trialReminderStorageKey]);

  const handleTrialReminderManage = useCallback(() => {
    dismissTrialReminder();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
    rootNavigationRef.current?.navigate('AppTabs', {
      screen: 'SettingsTab',
      params: { screen: 'MembershipBilling' },
    });
  }, [dismissTrialReminder]);

  const resolveAlertRoutingContext = useCallback(async (alertId: string) => {
    const normalizedAlertId = alertId.trim();
    if (!normalizedAlertId) {
      return null;
    }
    const { data, error } = await supabase
      .from('alerts')
      .select('call_id, profile_id')
      .eq('id', normalizedAlertId)
      .maybeSingle();

    if (error) {
      logEvent('notification_route_lookup_failed', {
        screen: 'App',
        extra: {
          alertId: normalizedAlertId,
          reason: 'alert_lookup_failed',
        },
      });
      return null;
    }

    const callId =
      typeof data?.call_id === 'string' && data.call_id.trim().length > 0
        ? data.call_id.trim()
        : undefined;
    const profileId =
      typeof data?.profile_id === 'string' && data.profile_id.trim().length > 0
        ? data.profile_id.trim()
        : undefined;
    if (!callId && !profileId) {
      return null;
    }
    return { callId, profileId };
  }, []);

  const activateProfileForNotification = useCallback(
    async (profileId?: string) => {
      const normalizedProfileId = profileId?.trim();
      if (!normalizedProfileId || !profiles?.length) {
        return;
      }
      if (activeProfile?.id === normalizedProfileId) {
        return;
      }
      const matchedProfile = profiles.find((profile) => profile.id === normalizedProfileId);
      if (!matchedProfile) {
        return;
      }
      setActiveProfile(matchedProfile);
      await Promise.resolve();
    },
    [activeProfile?.id, profiles, setActiveProfile]
  );

  const resolvePendingNotification = useCallback(async () => {
    if (isResolvingNotificationRef.current) {
      return;
    }
    const payload = pendingNotificationRef.current;
    if (!payload) {
      return;
    }
    if (!session) {
      return;
    }
    if (!rootNavigationRef.current?.isReady()) {
      return;
    }
    isResolvingNotificationRef.current = true;
    try {
      const normalizedAlertType = (payload.alertType ?? '').trim().toLowerCase();
      let resolvedCallId = payload.callId?.trim();
      let resolvedProfileId = payload.profileId?.trim();
      const retryKey =
        payload.alertId?.trim() ??
        payload.callId?.trim() ??
        `${payload.routeTarget ?? 'unknown'}:${normalizedAlertType || 'unknown'}`;
      const retryCount = notificationRetryCountRef.current[retryKey] ?? 0;

      const shouldLookupAlertContext =
        Boolean(payload.alertId) &&
        (!resolvedCallId ||
          !resolvedProfileId ||
          payload.routeTarget === 'call_detail' ||
          CALL_DETAIL_ALERT_TYPES.has(normalizedAlertType) ||
          payload.routeTarget === 'alerts');

      if (shouldLookupAlertContext && payload.alertId) {
        const needsCallDetailResolution =
          payload.routeTarget === 'call_detail' ||
          CALL_DETAIL_ALERT_TYPES.has(normalizedAlertType);

        for (let attempt = 0; attempt < 3; attempt += 1) {
          const context = await resolveAlertRoutingContext(payload.alertId);
          if (context?.callId && !resolvedCallId) {
            resolvedCallId = context.callId;
          }
          if (context?.profileId && !resolvedProfileId) {
            resolvedProfileId = context.profileId;
          }
          if (!needsCallDetailResolution || resolvedCallId) {
            break;
          }
          if (attempt < 2) {
            await new Promise((resolve) => setTimeout(resolve, 220 * (attempt + 1)));
          }
        }
      }

      if (
        !onboardingComplete &&
        payload.routeTarget !== 'support_portal' &&
        payload.routeTarget !== 'membership_billing' &&
        payload.routeTarget !== 'membership_facility_offer'
      ) {
        return;
      }

      await activateProfileForNotification(resolvedProfileId);

      const shouldOpenCallDetail =
        Boolean(resolvedCallId) &&
        (payload.routeTarget === 'call_detail' ||
          CALL_DETAIL_ALERT_TYPES.has(normalizedAlertType));

      if (shouldOpenCallDetail && resolvedCallId) {
        pendingNotificationRef.current = null;
        delete notificationRetryCountRef.current[retryKey];
        rootNavigationRef.current.navigate('CallDetailModal', { callId: resolvedCallId });
        return;
      }

      if (payload.routeTarget === 'call_detail') {
        if (payload.alertId && retryCount < 2) {
          notificationRetryCountRef.current[retryKey] = retryCount + 1;
          pendingNotificationRef.current = {
            ...payload,
            callId: resolvedCallId,
            profileId: resolvedProfileId,
          };
          setTimeout(() => {
            void resolvePendingNotification();
          }, 500);
          return;
        }
        pendingNotificationRef.current = null;
        delete notificationRetryCountRef.current[retryKey];
        rootNavigationRef.current.navigate('AppTabs', {
          screen: 'AlertsTab',
          params: { initialMode: 'needs' },
        });
        return;
      }

      pendingNotificationRef.current = null;
      delete notificationRetryCountRef.current[retryKey];

      if (payload.routeTarget === 'trusted_call_detail' && payload.alertId) {
        rootNavigationRef.current.navigate('TrustedCallDetail', { alertId: payload.alertId });
        return;
      }
      if (payload.routeTarget === 'calls_trusted') {
        if (payload.alertId) {
          rootNavigationRef.current.navigate('TrustedCallDetail', { alertId: payload.alertId });
        } else {
          rootNavigationRef.current.navigate('AppTabs', {
            screen: 'CallsTab',
            params: {
              screen: 'Calls',
              params: { initialFilter: 'trusted' },
            },
          });
        }
        return;
      }
      if (payload.routeTarget === 'calls_all') {
        rootNavigationRef.current.navigate('AppTabs', {
          screen: 'CallsTab',
          params: {
            screen: 'Calls',
            params: { initialFilter: 'all' },
          },
        });
        return;
      }
      if (payload.routeTarget === 'circle_activity') {
        rootNavigationRef.current.navigate('CircleActivityModal', { activities: [] });
        return;
      }
      if (payload.routeTarget === 'support_portal') {
        rootNavigationRef.current.navigate('SupportPortal');
        return;
      }
      if (payload.routeTarget === 'membership_billing') {
        rootNavigationRef.current.navigate('AppTabs', {
          screen: 'SettingsTab',
          params: {
            screen: 'MembershipBilling',
          },
        });
        return;
      }
      if (payload.routeTarget === 'membership_facility_offer') {
        rootNavigationRef.current.navigate('MembershipFacilityOffer', {
          initialCode: payload.facilityCode,
          claimToken: payload.facilityToken,
          facilitySlug: payload.facilitySlug,
          source: 'deeplink',
        });
        return;
      }
      if (payload.routeTarget === 'nudge_test_call') {
        if (!canManageProfile) {
          return;
        }
        rootNavigationRef.current.navigate('OnboardingTestCall', { source: 'nudge' });
        return;
      }
      if (payload.routeTarget === 'nudge_alert_prefs') {
        if (!canManageProfile) {
          return;
        }
        rootNavigationRef.current.navigate('OnboardingAlerts', { source: 'nudge' });
        return;
      }
      if (payload.routeTarget === 'nudge_safe_phrases') {
        if (!canManageProfile) {
          return;
        }
        rootNavigationRef.current.navigate('OnboardingSafePhrases', { source: 'nudge' });
        return;
      }
      if (payload.alertId || payload.routeTarget === 'alerts' || payload.alertType) {
        rootNavigationRef.current.navigate('AppTabs', {
          screen: 'AlertsTab',
          params: payload.alertsMode ? { initialMode: payload.alertsMode } : undefined,
        });
      }
    } finally {
      isResolvingNotificationRef.current = false;
    }
  }, [
    activateProfileForNotification,
    canManageProfile,
    onboardingComplete,
    resolveAlertRoutingContext,
    session,
  ]);

  const consumePendingSiriRoute = useCallback(async () => {
    try {
      const route = await consumePendingSiriRouteNative();
      if (!route) {
        return;
      }
      const payload = parseWidgetRoutePayload(route);
      if (!payload) {
        return;
      }
      pendingNotificationRef.current = payload;
      void resolvePendingNotification();
    } catch {
      // No-op: Siri route handoff is best-effort.
    }
  }, [resolvePendingNotification]);

  useEffect(() => {
    const handleRouteUrl = (url?: string | null) => {
      if (!url) {
        return;
      }
      const payload = parseWidgetRoutePayload(url);
      if (!payload) {
        return;
      }
      pendingNotificationRef.current = payload;
      void resolvePendingNotification();
    };

    const subscription = Linking.addEventListener('url', (event) => {
      handleRouteUrl(event.url);
    });
    Linking.getInitialURL()
      .then((url) => {
        handleRouteUrl(url);
      })
      .catch(() => null);

    return () => subscription.remove();
  }, [resolvePendingNotification]);

  useEffect(() => {
    void consumePendingSiriRoute();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void consumePendingSiriRoute();
      }
    });
    return () => subscription.remove();
  }, [consumePendingSiriRoute]);

  useEffect(() => {
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (!response) {
          return;
        }
        const data = response.notification.request.content.data as Record<string, unknown>;
        pendingNotificationRef.current = parseNotificationPayload(data);
        void resolvePendingNotification();
      })
      .catch(() => null);
  }, [resolvePendingNotification]);

  useEffect(() => {
    notificationListenerRef.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as Record<string, unknown>;
        const payload = parseNotificationPayload(data);
        if (!payload.callId && !payload.alertId && !payload.routeTarget && !payload.alertType) {
          return;
        }
        logEvent('notification_opened', {
          screen: 'App',
          extra: {
            callId: payload.callId,
            alertId: payload.alertId,
            routeTarget: payload.routeTarget,
            alertType: payload.alertType,
            supportTicketId: payload.supportTicketId,
            supportMessageId: payload.supportMessageId,
          },
        });
        pendingNotificationRef.current = payload;
        void resolvePendingNotification();
      }
    );
    return () => {
      notificationListenerRef.current?.remove();
    };
  }, [resolvePendingNotification]);

  useEffect(() => {
    void resolvePendingNotification();
  }, [session, resolvePendingNotification]);

  const navTheme = useMemo(() => {
    const baseTheme = mode === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...baseTheme,
      colors: {
        ...baseTheme.colors,
        background: theme.colors.bg,
        card: theme.colors.surface,
        border: theme.colors.border,
        text: theme.colors.text,
        primary: theme.colors.accent,
      },
    };
  }, [theme, mode]);

  const statusBarStyle = mode === 'light' ? 'dark' : 'light';
  const isBusy = useMemo(
    () =>
      isLoading ||
      (session
        ? profileLoading || subscriptionLoading || !hasResolvedSubscriptionStatus
        : false),
    [isLoading, session, profileLoading, subscriptionLoading, hasResolvedSubscriptionStatus]
  );
  const sessionKey = session?.user?.id ?? '__anon__';
  const [readySessionKey, setReadySessionKey] = useState<string | null>(null);
  const [splashVisible, setSplashVisible] = useState(true);
  const [navigationReady, setNavigationReady] = useState(false);

  useEffect(() => {
    if (!isBusy) {
      setReadySessionKey((prev) => (prev === sessionKey ? prev : sessionKey));
    }
  }, [isBusy, sessionKey]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSplashVisible(false);
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  const waitingForSessionBootstrap =
    readySessionKey !== sessionKey || (Boolean(session) && resolvedSessionKey !== sessionKey);

  if (waitingForSessionBootstrap) {
    return <SplashScreen persistent />;
  }

  const showSplashOverlay = splashVisible || !navigationReady;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <NavigationContainer
        theme={navTheme}
        ref={rootNavigationRef}
        onReady={() => {
          setNavigationReady(true);
          if (pendingNotificationRef.current) {
            void resolvePendingNotification();
          }
        }}
      >
        <RootNavigator />
        <StatusBar style={statusBarStyle} />
      </NavigationContainer>
      {showSplashOverlay ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="auto">
          <SplashScreen persistent={!navigationReady} />
        </View>
      ) : null}
      <SessionExpiredModal
        visible={showSessionExpired}
        theme={theme}
        mode={mode}
        onDismiss={clearSessionExpired}
      />
      <TrialReminderModal
        visible={showTrialReminder}
        daysLeft={trialReminderDaysLeft}
        theme={theme}
        mode={mode}
        onManage={handleTrialReminderManage}
        onLater={dismissTrialReminder}
      />
    </View>
  );
}

function AppContent() {
  const { theme } = useTheme();

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }
    Notifications.setNotificationChannelAsync(ACTIVITY_PUSH_CHANNEL_ID, {
      name: 'Activity Alerts',
      importance: Notifications.AndroidImportance.HIGH,
      sound: ACTIVITY_PUSH_SOUND,
      vibrationPattern: [0, 250, 250, 250],
      enableVibrate: true,
      lightColor: '#3b82f6',
    })
      .then(() =>
        Notifications.setNotificationChannelAsync(SUPPORT_PUSH_CHANNEL_ID, {
          name: 'Support Updates',
          importance: Notifications.AndroidImportance.HIGH,
          sound: SUPPORT_PUSH_SOUND,
          vibrationPattern: [0, 250, 250, 250],
          enableVibrate: true,
          lightColor: '#3b82f6',
        })
      )
      .catch((err) => {
        console.warn('[notifications] Failed to configure notification channels', err);
      });
  }, []);

  return (
    <ProfileProvider>
      <SubscriptionProvider>
        <SupportProvider>
          <InviteLinkHandler />
          <TwilioVoiceClientManager />
          <SafeAreaProvider initialMetrics={initialWindowMetrics ?? undefined}>
            <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
              <NavigationHost />
              <AuthCallbackHandler />
            </GestureHandlerRootView>
          </SafeAreaProvider>
        </SupportProvider>
      </SubscriptionProvider>
    </ProfileProvider>
  );
}

export default function App() {
  const posthogClient = useMemo(() => getPostHogClient(), []);

  const content = (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );

  if (!posthogClient) {
    console.warn('[PostHog] client missing; EXPO_PUBLIC_POSTHOG_KEY is empty.');
    return content;
  }

  posthogClient.capture('posthog_initialized');

  return (
    <PostHogProvider client={posthogClient}>
      {content}
    </PostHogProvider>
  );
}
