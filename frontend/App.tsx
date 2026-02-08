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
import { Alert, StyleSheet, View } from 'react-native';
import {
  SafeAreaProvider,
  initialWindowMetrics,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';

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
import SupportScreen from './src/screens/support/SupportScreen';
import SupportTicketsScreen from './src/screens/support/SupportTicketsScreen';
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
import TwilioVoiceClientManager from './src/components/twilio/TwilioVoiceClientManager';
import * as Sentry from '@sentry/react-native';
import { logEvent } from './src/services/sentry';

const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn: sentryDsn,

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: true,

  // Enable Logs
  enableLogs: true,

  // Configure Session Replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  integrations: [Sentry.mobileReplayIntegration(), Sentry.feedbackIntegration()],

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

enableScreens(true);

type PendingNotificationData = {
  callId?: string;
  alertId?: string;
};

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
    </SettingsStack.Navigator>
  );
}

function parseInviteIdFromUrl(url: string) {
  const parsed = Linking.parse(url);
  if (!parsed.path) {
    return null;
  }
  const segments = parsed.path.split('/');
  const inviteIndex = segments.findIndex((segment) => segment === 'invite' || segment === 'invites');
  if (inviteIndex >= 0 && segments.length > inviteIndex + 1) {
    return segments[inviteIndex + 1];
  }
  return null;
}

function InviteLinkHandler() {
  const { session } = useAuth();
  const { refreshProfiles } = useProfile();
  const pendingInviteRef = useRef<string | null>(null);

  const acceptInvite = useCallback(
    async (inviteId: string) => {
      try {
        await authorizedFetch(`/profiles/invites/${inviteId}/accept`, {
          method: 'POST',
        });
        await refreshProfiles();
        Alert.alert('Invite accepted', 'You now have access to the shared profile.');
      } catch (err) {
        console.error('Failed to accept invite', err);
      }
    },
    [refreshProfiles]
  );

  const handleUrl = useCallback(
    async (url: string) => {
      const inviteId = parseInviteIdFromUrl(url);
      if (!inviteId) {
        return;
      }
      if (!session) {
        pendingInviteRef.current = inviteId;
        return;
      }
      await acceptInvite(inviteId);
    },
    [acceptInvite, session]
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
    if (session && pendingInviteRef.current) {
      const pending = pendingInviteRef.current;
      pendingInviteRef.current = null;
      acceptInvite(pending);
    }
  }, [acceptInvite, session]);

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
  const { session, isLoading } = useAuth();
  const { onboardingComplete, isLoading: profileLoading, authInvalid } = useProfile();

  const isBusy = isLoading || (session && profileLoading);

  if (isBusy) {
    return <SplashScreen />;
  }

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
              options={{ headerShown: false }}
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

  const resolvePendingNotification = useCallback(() => {
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
    pendingNotificationRef.current = null;
    if (payload.callId) {
      rootNavigationRef.current.navigate('CallDetailModal', { callId: payload.callId });
      return;
    }
    if (payload.alertId) {
      rootNavigationRef.current.dispatch(
        CommonActions.navigate({
          name: 'AppTabs',
          params: { screen: 'AlertsTab' },
        })
      );
    }
  }, [session]);

  useEffect(() => {
    notificationListenerRef.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as Record<string, unknown>;
        const payload: PendingNotificationData = {
          callId: typeof data.callId === 'string' ? data.callId : undefined,
          alertId: typeof data.alertId === 'string' ? data.alertId : undefined,
        };
        if (!payload.callId && !payload.alertId) {
          return;
        }
        logEvent('notification_opened', {
          screen: 'App',
          extra: { callId: payload.callId, alertId: payload.alertId },
        });
        pendingNotificationRef.current = payload;
        resolvePendingNotification();
      }
    );
    return () => {
      notificationListenerRef.current?.remove();
    };
  }, [resolvePendingNotification]);

  useEffect(() => {
    resolvePendingNotification();
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
  const [splashVisible, setSplashVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSplashVisible(false);
    }, 900);
    return () => clearTimeout(timer);
  }, []);

  if (isBusy || splashVisible) {
    return <SplashScreen />;
  }

  if (isBusy) {
    return <SplashScreen />;
  }
  return (
    <NavigationContainer
      theme={navTheme}
      ref={rootNavigationRef}
      onReady={() => {
        if (pendingNotificationRef.current) {
          resolvePendingNotification();
        }
      }}
    >
      <RootNavigator />
      <StatusBar style={statusBarStyle} />
    </NavigationContainer>
  );
}

function AppContent() {
  return (
    <ProfileProvider>
      <SupportProvider>
        <TwilioVoiceClientManager />
        <InviteLinkHandler />
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

export default Sentry.wrap(function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
});
