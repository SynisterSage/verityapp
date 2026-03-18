import {
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { authorizedFetch } from '../../services/backend';
import { useProfile } from '../../context/ProfileContext';
import { useTheme } from '../../context/ThemeContext';
import { useSubscription } from '../../context/SubscriptionContext';
import { withOpacity } from '../../utils/color';
import type { AppTheme } from '../../theme/tokens';
import { RootStackParamList } from '../../navigation/types';
import OnboardingHeader from '../../components/onboarding/OnboardingHeader';
import ActionFooter from '../../components/onboarding/ActionFooter';
import { logError, logEvent } from '../../services/sentry';

const CODE_LENGTH = 8;

export default function OnboardingInviteCodeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'OnboardingInviteCode'>>();
  const route = useRoute<RouteProp<RootStackParamList, 'OnboardingInviteCode'>>();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const styles = useMemo(() => createInviteCodeStyles(theme), [theme]);
  const { refreshProfiles, setOnboardingComplete } = useProfile();
  const { refreshStatus } = useSubscription();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [code, setCode] = useState('');
  const [footerHeight, setFooterHeight] = useState(188);
  const firstNameRef = useRef<TextInput | null>(null);
  const lastNameRef = useRef<TextInput | null>(null);
  const codeInputRef = useRef<TextInput | null>(null);
  const pulse = useRef(new Animated.Value(1)).current;

  const codeValue = code;
  const isCodeComplete = code.length === CODE_LENGTH;
  const areNamesEntered = firstName.trim().length > 0 && lastName.trim().length > 0;

  useEffect(() => {
    if (isCodeComplete) {
      Animated.sequence([
        Animated.spring(pulse, { toValue: 1.03, useNativeDriver: true }),
        Animated.spring(pulse, { toValue: 1, useNativeDriver: true }),
      ]).start();
    }
  }, [isCodeComplete, pulse]);

  const sanitizeCode = (value: string) => {
    return value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, CODE_LENGTH);
  };

  const formatDisplayValue = (value: string) => {
    if (value.length <= 4) {
      return value;
    }
    return `${value.slice(0, 4)}-${value.slice(4)}`;
  };

  const handleCodeChange = (text: string) => {
    setCode(sanitizeCode(text));
  };

  useEffect(() => {
    const initialCode = route.params?.initialCode;
    if (!initialCode || code.length > 0) {
      return;
    }
    setCode(sanitizeCode(initialCode));
  }, [code.length, route.params?.initialCode]);

  const acceptCode = async () => {
    if (!areNamesEntered) {
      setMessage('Add your first and last name.');
      logEvent('invite_code_invalid', {
        level: 'warning',
        screen: 'OnboardingInviteCode',
        extra: { reason: 'missing_name' },
      });
      return;
    }
    if (!isCodeComplete) {
      setMessage('Fill the 8-character code.');
      logEvent('invite_code_invalid', {
        level: 'warning',
        screen: 'OnboardingInviteCode',
        extra: { reason: 'code_incomplete' },
      });
      return;
    }
    setMessage('');
    setIsSubmitting(true);
    try {
      await authorizedFetch(`/profiles/invites/${codeValue}/accept`, {
        method: 'POST',
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
        }),
      });
      await refreshStatus({ silent: true });
      await refreshProfiles();
      setOnboardingComplete(true);
      logEvent('invite_code_accepted', { screen: 'OnboardingInviteCode' });
      logEvent('onboarding_completed', { screen: 'OnboardingInviteCode' });
    } catch (err: any) {
      setMessage(err?.message || 'Unable to redeem invite code.');
      logError(err, {
        screen: 'OnboardingInviteCode',
        extra: { reason: err?.message || 'Unable to redeem invite code.' },
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.outer}>
      <SafeAreaView style={styles.screen} edges={['bottom']}>
        <OnboardingHeader chapter="Circle" activeStep={2} totalSteps={2} showBack />
        <View style={styles.keyboardAvoiding}>
          <ScrollView
            contentContainerStyle={[
              styles.body,
              {
                paddingTop: 28,
                flexGrow: 1,
                paddingBottom: footerHeight + 24,
              },
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentInsetAdjustmentBehavior="automatic"
          >
            <View>
              <Text style={styles.title}>Join your circle</Text>
              <Text style={styles.subtitle}>Enter your name and the code shared with you.</Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>First name</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="person-outline" size={18} color={withOpacity(theme.colors.text, 0.45)} />
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Robert"
                  placeholderTextColor={withOpacity(theme.colors.textMuted, 0.7)}
                  value={firstName}
                  onChangeText={setFirstName}
                  autoCapitalize="words"
                  ref={firstNameRef}
                  returnKeyType="next"
                  onSubmitEditing={() => lastNameRef.current?.focus()}
                />
              </View>
              <Text style={styles.inputLabel}>Last name</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="person-outline" size={18} color={withOpacity(theme.colors.text, 0.45)} />
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Miller"
                  placeholderTextColor={withOpacity(theme.colors.textMuted, 0.7)}
                  value={lastName}
                  onChangeText={setLastName}
                  autoCapitalize="words"
                  ref={lastNameRef}
                  returnKeyType="next"
                  onSubmitEditing={() => codeInputRef.current?.focus()}
                />
              </View>
            </View>

            <View style={styles.codeSection}>
              <Text style={styles.codeLabel}>8-character invite code</Text>
              <Animated.View
                style={[
                  styles.codeInputWrapper,
                  { transform: [{ scale: pulse }] },
                ]}
              >
                <TextInput
                  ref={codeInputRef}
                  style={styles.codeInput}
                  keyboardType="default"
                  maxLength={CODE_LENGTH + 1}
                  value={formatDisplayValue(code)}
                  onChangeText={handleCodeChange}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  placeholder="AB12-CD34"
                  placeholderTextColor={withOpacity(theme.colors.textMuted, 0.45)}
                  textAlign="center"
                  returnKeyType="done"
                />
              </Animated.View>
            </View>

            {message ? <Text style={styles.message}>{message}</Text> : null}
          </ScrollView>
        </View>

        <ActionFooter
          primaryLabel="Connect to Circle"
          onPrimaryPress={acceptCode}
          primaryLoading={isSubmitting}
          primaryDisabled={!areNamesEntered || !isCodeComplete || isSubmitting}
          onLayout={(event) => {
            const nextHeight = Math.ceil(event.nativeEvent.layout.height);
            setFooterHeight((prev) => (Math.abs(prev - nextHeight) > 1 ? nextHeight : prev));
          }}
        />
      </SafeAreaView>
    </View>
  );
}

const createInviteCodeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    outer: {
      flex: 1,
      backgroundColor: theme.colors.bg,
    },
    screen: {
      flex: 1,
      backgroundColor: theme.colors.bg,
    },
    body: {
      paddingHorizontal: 32,
      paddingBottom: 20,
    },
    title: {
      fontSize: 34,
      fontWeight: '700',
      letterSpacing: -0.35,
      color: theme.colors.text,
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 17,
      fontWeight: '500',
      color: theme.colors.textMuted,
      maxWidth: 320,
    },
    inputGroup: {
      marginTop: 32,
      gap: 16,
    },
    inputLabel: {
      fontSize: 12,
      letterSpacing: 0.6,
      color: theme.colors.textMuted,
      marginBottom: 4,
    },
    inputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      height: 60,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: 12,
      gap: 12,
      backgroundColor: theme.colors.surface,
    },
    input: {
      flex: 1,
      color: theme.colors.text,
    },
    codeSection: {
      marginTop: 32,
      gap: 12,
    },
    codeLabel: {
      fontSize: 12,
      letterSpacing: 0.6,
      color: theme.colors.textMuted,
      marginBottom: 4,
    },
    codeInputWrapper: {
      width: '100%',
      height: 64,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      justifyContent: 'center',
      paddingHorizontal: 16,
    },
    codeInput: {
      fontSize: 24,
      letterSpacing: 2,
      fontWeight: '700',
      color: theme.colors.text,
      textAlign: 'center',
    },
    message: {
      marginTop: 16,
      color: theme.colors.danger,
      fontSize: 12,
      textAlign: 'center',
    },
    keyboardAvoiding: {
      flex: 1,
      width: '100%',
    },
  });
