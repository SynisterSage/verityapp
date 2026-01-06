import 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { enableScreens } from 'react-native-screens';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { ProfileProvider, useProfile } from './src/context/ProfileContext';
import SignInScreen from './src/screens/auth/SignInScreen';
import SignUpScreen from './src/screens/auth/SignUpScreen';
import HomeScreen from './src/screens/dashboard/HomeScreen';
import CallsScreen from './src/screens/dashboard/CallsScreen';
import CallDetailScreen from './src/screens/dashboard/CallDetailScreen';
import AlertsScreen from './src/screens/dashboard/AlertsScreen';
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
  Home: undefined;
  Calls: undefined;
  CallDetail: { callId: string };
  Alerts: undefined;
  SafePhrases: undefined;
  Blocklist: undefined;
};

enableScreens(true);

const Stack = createStackNavigator<RootStackParamList>();

function RootNavigator() {
  const { session, isLoading } = useAuth();
  const { onboardingComplete, isLoading: profileLoading } = useProfile();

  if (isLoading || (session && profileLoading)) {
    return null;
  }

  return (
    <Stack.Navigator>
      {session ? (
        !onboardingComplete ? (
          <>
            <Stack.Screen
              name="OnboardingProfile"
              component={CreateProfileScreen}
              options={{ title: 'Create Profile' }}
            />
            <Stack.Screen
              name="OnboardingPasscode"
              component={PasscodeScreen}
              options={{ title: 'Set Passcode' }}
            />
            <Stack.Screen
              name="OnboardingSafePhrases"
              component={OnboardingSafePhrasesScreen}
              options={{ title: 'Safe Phrases' }}
            />
            <Stack.Screen
              name="OnboardingInviteFamily"
              component={InviteFamilyScreen}
              options={{ title: 'Invite Family' }}
            />
            <Stack.Screen
              name="OnboardingAlerts"
              component={AlertPrefsScreen}
              options={{ title: 'Alert Preferences' }}
            />
            <Stack.Screen
              name="OnboardingTestCall"
              component={TestCallScreen}
              options={{ title: 'Test Call' }}
            />
          </>
        ) : (
        <>
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="Calls" component={CallsScreen} />
          <Stack.Screen name="CallDetail" component={CallDetailScreen} />
          <Stack.Screen name="Alerts" component={AlertsScreen} />
          <Stack.Screen name="SafePhrases" component={SafePhrasesScreen} />
          <Stack.Screen name="Blocklist" component={BlocklistScreen} />
        </>
        )
      ) : (
        <>
          <Stack.Screen name="SignIn" component={SignInScreen} />
          <Stack.Screen name="SignUp" component={SignUpScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ProfileProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <NavigationContainer>
            <RootNavigator />
            <StatusBar style="light" />
          </NavigationContainer>
        </GestureHandlerRootView>
      </ProfileProvider>
    </AuthProvider>
  );
}
