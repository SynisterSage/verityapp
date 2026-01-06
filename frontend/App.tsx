import 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { enableScreens } from 'react-native-screens';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
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
import CreateProfileScreen from './src/screens/onboarding/CreateProfileScreen';
import PasscodeScreen from './src/screens/onboarding/PasscodeScreen';
import OnboardingSafePhrasesScreen from './src/screens/onboarding/OnboardingSafePhrasesScreen';
import InviteFamilyScreen from './src/screens/onboarding/InviteFamilyScreen';
import AlertPrefsScreen from './src/screens/onboarding/AlertPrefsScreen';
import TestCallScreen from './src/screens/onboarding/TestCallScreen';

export type RootStackParamList = {
  SignIn: undefined;
  SignUp: undefined;
  OnboardingProfile: undefined;
  OnboardingPasscode: undefined;
  OnboardingSafePhrases: undefined;
  OnboardingInviteFamily: undefined;
  OnboardingAlerts: undefined;
  OnboardingTestCall: undefined;
  AppTabs: undefined;
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
  SafePhrases: undefined;
  Blocklist: undefined;
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
      <SettingsStack.Screen
        name="SafePhrases"
        component={SafePhrasesScreen}
      />
      <SettingsStack.Screen name="Blocklist" component={BlocklistScreen} />
    </SettingsStack.Navigator>
  );
}

function AppTabs() {
  const insets = useSafeAreaInsets();
  const dockBottom = Math.max(10, insets.bottom + 3);
  const dockHeight = 40 + Math.max(0, insets.bottom - 6);
  const dockPaddingBottom = Math.max(8, insets.bottom);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        sceneContainerStyle: { backgroundColor: '#0b111b' },
        tabBarActiveTintColor: '#8ab4ff',
        tabBarInactiveTintColor: '#51607a',
        tabBarStyle: {
          backgroundColor: '#101827',
          borderTopWidth: 0,
          height: dockHeight,
          marginHorizontal: 16,
          position: 'absolute',
          bottom: dockBottom,
          left: 0,
          right: 0,
          borderRadius: 22,
          paddingBottom: dockPaddingBottom,
          paddingTop: 6,
          shadowColor: '#000',
          shadowOpacity: 0.35,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
          elevation: 12,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
        tabBarHideOnKeyboard: true,
        tabBarIcon: ({ color, size, focused }) => {
          const icons: Record<keyof TabParamList, keyof typeof Ionicons.glyphMap> = {
            HomeTab: focused ? 'home' : 'home-outline',
            CallsTab: focused ? 'call' : 'call-outline',
            AlertsTab: focused ? 'alert-circle' : 'alert-circle-outline',
            SettingsTab: focused ? 'settings' : 'settings-outline',
          };
          const iconName = icons[route.name as keyof TabParamList] ?? 'ellipse';
          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="HomeTab" component={HomeScreen} options={{ title: 'Home' }} />
      <Tab.Screen name="CallsTab" component={CallsStackNavigator} options={{ title: 'Calls' }} />
      <Tab.Screen name="AlertsTab" component={AlertsScreen} options={{ title: 'Alerts' }} />
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

  if (isLoading || (session && profileLoading)) {
    return null;
  }

  return (
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
              name="OnboardingTestCall"
              component={TestCallScreen}
              options={{ title: 'Test Call' }}
            />
          </>
        ) : (
          <RootStack.Screen
            name="AppTabs"
            component={AppTabs}
            options={{ headerShown: false }}
          />
        )
      ) : (
        <>
          <RootStack.Screen name="SignIn" component={SignInScreen} />
          <RootStack.Screen name="SignUp" component={SignUpScreen} />
        </>
      )}
    </RootStack.Navigator>
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
