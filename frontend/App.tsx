import 'react-native-gesture-handler';
import { useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { enableScreens } from 'react-native-screens';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Animated, StyleSheet } from 'react-native';
import {
  SafeAreaProvider,
  initialWindowMetrics,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { ProfileProvider, useProfile } from './src/context/ProfileContext';
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

export type RootStackParamList = {
  SignIn: undefined;
  SignUp: undefined;
  OnboardingProfile: undefined;
  OnboardingPasscode: undefined;
  OnboardingTrustedContacts: undefined;
  OnboardingSafePhrases: undefined;
  OnboardingInviteFamily: undefined;
  OnboardingAlerts: undefined;
  OnboardingCallForwarding: undefined;
  OnboardingTestCall: undefined;
  AppTabs: undefined;
  CallDetailModal: { callId: string };
};

type TabParamList = {
  HomeTab: undefined;
  CallsTab: undefined;
  AlertsTab: undefined;
  SettingsTab: undefined;
};

type CallsStackParamList = {
  Calls: undefined;
  CallDetail: { callId: string };
};

type SettingsStackParamList = {
  Settings: undefined;
  Account: undefined;
  Notifications: undefined;
  Security: undefined;
  ChangePasscode: undefined;
  SafePhrases: undefined;
  TrustedContacts: undefined;
  Blocklist: undefined;
  DataPrivacy: undefined;
  Automation: undefined;
};

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
    </SettingsStack.Navigator>
  );
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
  const splashProgress = useRef(new Animated.Value(0)).current;

  const isBusy = isLoading || (session && profileLoading);

  useEffect(() => {
    if (isBusy) {
      setRenderSplash(true);
      splashProgress.setValue(0);
      return;
    }
    const timer = setTimeout(() => {
      Animated.timing(splashProgress, {
        toValue: 1,
        duration: 380,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          setRenderSplash(false);
        }
      });
    }, 900);
    return () => clearTimeout(timer);
  }, [isBusy, splashProgress]);

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
            <RootStack.Screen name="SignIn" component={SignInScreen} />
            <RootStack.Screen name="SignUp" component={SignUpScreen} />
          </>
        )}
      </RootStack.Navigator>
      {renderSplash && (
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            {
              zIndex: 10,
              opacity: splashProgress.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 0],
                extrapolate: 'clamp',
              }),
              transform: [
                {
                  translateY: splashProgress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -600],
                    extrapolate: 'clamp',
                  }),
                },
              ],
            },
          ]}
        >
          <SplashScreen />
        </Animated.View>
      )}
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ProfileProvider>
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
  );
}
