import 'react-native-gesture-handler';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  DefaultTheme,
  DarkTheme,
  NavigationContainer,
  NavigationProp,
  useNavigation,
  CommonActions,
} from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { enableScreens } from 'react-native-screens';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Alert, AppState, Platform, StyleSheet, View } from 'react-native';
import {
  SafeAreaProvider,
  initialWindowMetrics,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { ProfileProvider, useProfile } from './src/context/ProfileContext';
import { AlertProvider } from './src/context/AlertContext';
import { SupportProvider } from './src/context/SupportContext';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { authorizedFetch } from './src/services/backend';
import { supabase } from './src/services/supabase';
import SignInScreen from './src/screens/auth/SignInScreen';
import SignUpScreen from './src/screens/auth/SignUpScreen';
import ConfirmEmailScreen from './src/screens/auth/ConfirmEmailScreen';
import HomeScreen from './src/screens/dashboard/HomeScreen';
import CallsScreen from './src/screens/dashboard/CallsScreen';
import CallDetailScreen from './src/screens/dashboard/CallDetailScreen';
import ActiveCallScreen from './src/screens/dashboard/ActiveCallScreen';
import CircleActivityScreen from './src/screens/dashboard/CircleActivityScreen';
import AlertsScreen from './src/screens/dashboard/AlertsScreen';
import SettingsScreen from './src/screens/settings/SettingsScreen';
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
import OnboardingChoiceScreen from './src/screens/onboarding/OnboardingChoiceScreen';
import OnboardingInviteCodeScreen from './src/screens/onboarding/OnboardingInviteCodeScreen';
import OnboardingSuccessScreen from './src/screens/onboarding/OnboardingSuccessScreen';
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

enableScreens(true);

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
    | 'circle_activity'
    | 'alerts'
    | 'support_portal';
  alertType?: string;
};

const ACTIVITY_PUSH_CHANNEL_ID = 'activity-alerts';
const ACTIVITY_PUSH_SOUND = 'activity-notification.wav';
const SUPPORT_PUSH_CHANNEL_ID = 'support-updates';
const SUPPORT_PUSH_SOUND = 'support-notification.wav';
const CALL_DETAIL_ALERT_TYPES = new Set<string>(['fraud', 'safe', 'call_review']);
const PENDING_INVITE_ID_KEY = 'app:pending-invite-id';

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
    return 'calls_trusted';
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
  const profileId = readDataString(normalizedData, 'profileId', 'profile_id');
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

  return (
    <RootStack.Navigator>
      {session && !authInvalid ? (
        !onboardingComplete ? (
          <>
            <RootStack.Screen
              name="OnboardingChoice"
              component={OnboardingChoiceScreen}
              options={{ headerShown: false }}
            />
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
              name="OnboardingTrustedContacts"
              component={OnboardingTrustedContactsScreen}
              options={{ headerShown: false }}
            />
            <RootStack.Screen
              name="OnboardingSafePhrases"
              component={OnboardingSafePhrasesScreen}
              options={{ headerShown: false }}
            />
            <RootStack.Screen
              name="OnboardingInviteFamily"
              component={InviteFamilyScreen}
              options={{ headerShown: false }}
            />
            <RootStack.Screen
              name="OnboardingAlerts"
              component={AlertPrefsScreen}
              options={{ headerShown: false }}
            />
            <RootStack.Screen
              name="OnboardingCallForwarding"
              component={OnboardingCallForwardingScreen}
              options={{ title: 'Call Forwarding' }}
            />
            <RootStack.Screen
              name="OnboardingTestCall"
              component={TestCallScreen}
              options={{ title: 'Test Call' }}
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
            <RootStack.Screen
              name="ActiveCallModal"
              component={ActiveCallScreen}
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
            <RootStack.Screen
              name="ActiveCallModal"
              component={ActiveCallScreen}
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
      const isReset = params.mode === 'reset' || params.source === 'password';
      if (isReset) {
        console.log('Reset password flow detected');
        rootNavigationRef.current?.navigate('ResetPassword');
        return;
      }
      
      // Check if we have an auth code to exchange (PKCE flow)
      const code = toStringParam(params.code);
      const codeVerifier = toStringParam(params.code_verifier);
      
      console.log('=== PKCE EXTRACTION ===');
      console.log('code:', code ? `${code.substring(0, 20)}...` : 'MISSING');
      console.log('code_verifier:', codeVerifier ? `${codeVerifier.substring(0, 20)}...` : 'MISSING');
      console.log('code length:', code?.length ?? 0);
      console.log('verifier length:', codeVerifier?.length ?? 0);
      
      // Only attempt exchange if we have both code AND verifier (proper PKCE flow)
      if (code && codeVerifier) {
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
          }
        } catch (error) {
          console.error('=== EXCHANGE EXCEPTION ===');
          console.error('Exception:', error);
        }
      } else {
        console.warn('=== SKIPPING EXCHANGE ===');
        console.warn('Missing required params - code:', !!code, 'verifier:', !!codeVerifier);
      }
      
      const isConfirmation = params.type === 'signup' || !!params.token || params.source === 'confirmation' || (code && codeVerifier);
      const payload: { confirmed?: boolean; email?: string } = {
        confirmed: !!isConfirmation,
        email: toStringParam(params.email),
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

function NavigationHost() {
  const { mode, theme } = useTheme();
  const { session, isLoading } = useAuth();
  const { onboardingComplete, isLoading: profileLoading, authInvalid } = useProfile();
  const pendingNotificationRef = useRef<PendingNotificationData | null>(null);
  const notificationListenerRef = useRef<Notifications.Subscription | null>(null);
  const isResolvingNotificationRef = useRef(false);

  const resolveCallIdFromAlertId = useCallback(async (alertId: string) => {
    const normalizedAlertId = alertId.trim();
    if (!normalizedAlertId) {
      return null;
    }
    const { data, error } = await supabase
      .from('alerts')
      .select('call_id')
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

    const callId = data?.call_id;
    return typeof callId === 'string' && callId.trim().length > 0 ? callId.trim() : null;
  }, []);

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
      let resolvedCallId = payload.callId;

      const shouldLookupCallId =
        !resolvedCallId &&
        Boolean(payload.alertId) &&
        (payload.routeTarget === 'call_detail' ||
          CALL_DETAIL_ALERT_TYPES.has(normalizedAlertType));

      if (shouldLookupCallId && payload.alertId) {
        const fetchedCallId = await resolveCallIdFromAlertId(payload.alertId);
        if (fetchedCallId) {
          resolvedCallId = fetchedCallId;
        }
      }

      pendingNotificationRef.current = null;

      if (!onboardingComplete && payload.routeTarget !== 'support_portal') {
        return;
      }

      const shouldOpenCallDetail =
        Boolean(resolvedCallId) &&
        (payload.routeTarget === 'call_detail' ||
          CALL_DETAIL_ALERT_TYPES.has(normalizedAlertType));

      if (shouldOpenCallDetail && resolvedCallId) {
        rootNavigationRef.current.navigate('CallDetailModal', { callId: resolvedCallId });
        return;
      }

      if (payload.routeTarget === 'call_detail') {
        rootNavigationRef.current.dispatch(
          CommonActions.navigate({
            name: 'AppTabs',
            params: { screen: 'AlertsTab' },
          })
        );
        return;
      }
      if (payload.routeTarget === 'calls_trusted') {
        rootNavigationRef.current.dispatch(
          CommonActions.navigate({
            name: 'AppTabs',
            params: {
              screen: 'CallsTab',
              params: {
                screen: 'Calls',
                params: { initialFilter: 'trusted' },
              },
            },
          })
        );
        return;
      }
      if (payload.routeTarget === 'calls_all') {
        rootNavigationRef.current.dispatch(
          CommonActions.navigate({
            name: 'AppTabs',
            params: {
              screen: 'CallsTab',
              params: {
                screen: 'Calls',
                params: { initialFilter: 'all' },
              },
            },
          })
        );
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
      if (payload.alertId || payload.routeTarget === 'alerts' || payload.alertType) {
        rootNavigationRef.current.dispatch(
          CommonActions.navigate({
            name: 'AppTabs',
            params: {
              screen: 'AlertsTab',
              params: payload.alertsMode ? { initialMode: payload.alertsMode } : undefined,
            },
          })
        );
      }
    } finally {
      isResolvingNotificationRef.current = false;
    }
  }, [onboardingComplete, resolveCallIdFromAlertId, session]);

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
  const isBusy = useMemo(() => isLoading || (session ? profileLoading : false), [
    isLoading,
    session,
    profileLoading,
  ]);
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

  const waitingForSessionBootstrap = readySessionKey !== sessionKey;

  if (waitingForSessionBootstrap || splashVisible) {
    return <SplashScreen />;
  }

  return (
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
  );
}

function AppContent() {
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
      <SupportProvider>
        <InviteLinkHandler />
        <TwilioVoiceClientManager />
        <SafeAreaProvider initialMetrics={initialWindowMetrics ?? undefined}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <NavigationHost />
            <AuthCallbackHandler />
          </GestureHandlerRootView>
        </SafeAreaProvider>
      </SupportProvider>
    </ProfileProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
}
