import 'react-native-gesture-handler';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
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

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { ProfileProvider, useProfile } from './src/context/ProfileContext';
import { ThemeProvider } from './src/context/ThemeContext';
import { authorizedFetch } from './src/services/backend';
import SignInScreen from './src/screens/auth/SignInScreen';
import SignUpScreen from './src/screens/auth/SignUpScreen';
import HomeScreen from './src/screens/dashboard/HomeScreen';
import CallsScreen from './src/screens/dashboard/CallsScreen';
import CallDetailScreen from './src/screens/dashboard/CallDetailScreen';
import AlertsScreen from './src/screens/dashboard/AlertsScreen';
import SettingsScreen from './src/screens/settings/SettingsScreen';
import SafePhrasesScreen from './src/screens/settings/SafePhrasesScreen';
import BlocklistScreen from './src/screens/settings/BlocklistScreen';
import DataPrivacyScreen from './src/screens/settings/DataPrivacyScreen';
import TrustedContactsScreen from './src/screens/settings/TrustedContactsScreen';
import AccountScreen from './src/screens/settings/AccountScreen';
import SecurityScreen from './src/screens/settings/SecurityScreen';
import ChangePasscodeScreen from './src/screens/settings/ChangePasscodeScreen';
import NotificationsScreen from './src/screens/settings/NotificationsScreen';
import AutomationScreen from './src/screens/settings/AutomationScreen';
import EnterInviteCodeScreen from './src/screens/settings/EnterInviteCodeScreen';
import MembersScreen from './src/screens/settings/MembersScreen';
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
import {
  RootStackParamList,
  TabParamList,
  CallsStackParamList,
  SettingsStackParamList,
} from './src/navigation/types';

enableScreens(true);

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: '#0b111b',
    card: '#0b111b',
    border: '#0b111b',
    text: '#f5f7fb',
  },
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
  const dockBottom = Math.max(10, insets.bottom + 3);
  const dockHeight = 40 + Math.max(0, insets.bottom - 6);

  return (
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
  );
}

function RootNavigator() {
  const { session, isLoading } = useAuth();
  const { onboardingComplete, isLoading: profileLoading, authInvalid } = useProfile();
  const [renderSplash, setRenderSplash] = useState(true);

  const isBusy = isLoading || (session && profileLoading);

  useEffect(() => {
    if (isBusy) {
      setRenderSplash(true);
      return;
    }
    const timer = setTimeout(() => {
      setRenderSplash(false);
    }, 2600);
    return () => clearTimeout(timer);
  }, [isBusy]);

  if (isBusy) {
    return <SplashScreen />;
  }

  return (
    <>
      <RootStack.Navigator>
        {session && !authInvalid ? (
          !onboardingComplete ? (
            <>
              <RootStack.Screen
                name="OnboardingChoice"
                component={OnboardingChoiceScreen}
                options={{ title: 'Get started' }}
              />
              <RootStack.Screen
                name="OnboardingProfile"
                component={CreateProfileScreen}
                options={{ title: 'Create Profile' }}
              />
              <RootStack.Screen
                name="OnboardingPasscode"
                component={PasscodeScreen}
                options={{ title: 'Set Passcode' }}
              />
              <RootStack.Screen
                name="OnboardingTrustedContacts"
                component={OnboardingTrustedContactsScreen}
                options={{ title: 'Trusted Contacts' }}
              />
              <RootStack.Screen
                name="OnboardingSafePhrases"
                component={OnboardingSafePhrasesScreen}
                options={{ title: 'Safe Phrases' }}
              />
              <RootStack.Screen
                name="OnboardingInviteFamily"
                component={InviteFamilyScreen}
                options={{ title: 'Invite Family' }}
              />
              <RootStack.Screen
                name="OnboardingAlerts"
                component={AlertPrefsScreen}
                options={{ title: 'Alert Preferences' }}
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
                options={{ title: 'Enter invite code' }}
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
          </>
        )}
      </RootStack.Navigator>
      {renderSplash && (
        <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { zIndex: 10 }]}>
          <SplashScreen />
        </View>
      )}
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ProfileProvider>
          <InviteLinkHandler />
          <SafeAreaProvider initialMetrics={initialWindowMetrics ?? undefined}>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <NavigationContainer theme={navTheme}>
                <RootNavigator />
                <StatusBar style="light" />
              </NavigationContainer>
            </GestureHandlerRootView>
          </SafeAreaProvider>
        </ProfileProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
