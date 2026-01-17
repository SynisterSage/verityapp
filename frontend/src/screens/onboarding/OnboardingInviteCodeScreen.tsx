import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { authorizedFetch } from '../../services/backend';
import { useProfile } from '../../context/ProfileContext';
import { useTheme } from '../../context/ThemeContext';
import { RootStackParamList } from '../../navigation/types';
import OnboardingHeader from '../../components/onboarding/OnboardingHeader';
import ActionFooter from '../../components/onboarding/ActionFooter';

const CODE_LENGTH = 6;

export default function OnboardingInviteCodeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'OnboardingInviteCode'>>();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { refreshProfiles, setOnboardingComplete } = useProfile();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [codeDigits, setCodeDigits] = useState(Array(CODE_LENGTH).fill(''));

  const codeRefs = useRef<Array<TextInput | null>>(Array(CODE_LENGTH).fill(null));
  const pulse = useRef(new Animated.Value(1)).current;

  const codeValue = useMemo(() => codeDigits.join(''), [codeDigits]);
  const isCodeComplete = codeDigits.every((digit) => digit.length === 1);

  useEffect(() => {
    if (isCodeComplete) {
      Animated.sequence([
        Animated.spring(pulse, { toValue: 1.03, useNativeDriver: true }),
        Animated.spring(pulse, { toValue: 1, useNativeDriver: true }),
      ]).start();
    }
  }, [isCodeComplete, pulse]);

  const handleDigitChange = (text: string, index: number) => {
    const digit = text.replace(/\D/g, '').slice(-1);
    setCodeDigits((prev) => {
      const next = [...prev];
      next[index] = digit;
      return next;
    });
    if (digit && index < CODE_LENGTH - 1) {
      codeRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = ({ nativeEvent }: any, index: number) => {
    if (nativeEvent.key === 'Backspace' && !codeDigits[index] && index > 0) {
      codeRefs.current[index - 1]?.focus();
      setCodeDigits((prev) => {
        const next = [...prev];
        next[index - 1] = '';
        return next;
      });
    }
  };

  const acceptCode = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      setMessage('Add your first and last name.');
      return;
    }
    if (!isCodeComplete) {
      setMessage('Fill the 6-digit code.');
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
      await refreshProfiles();
      setOnboardingComplete(true);
    } catch (err: any) {
      setMessage(err?.message || 'Unable to redeem invite code.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.outer}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <SafeAreaView style={styles.screen} edges={['bottom']}>
        <OnboardingHeader chapter="Circle" activeStep={2} totalSteps={2} showBack />
        <ScrollView
          contentContainerStyle={[
            styles.body,
              {
                paddingTop: 28,
                flexGrow: 1,
                paddingBottom: Math.max(insets.bottom, 32) + 220,
              },
            ]}
            showsVerticalScrollIndicator={false}
          >
          <View>
            <Text style={styles.title}>Join your circle</Text>
            <Text style={styles.subtitle}>Enter your name and the code shared with you.</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>First name</Text>
            <View style={[styles.inputContainer, { borderColor: '#1b2534' }]}>
              <Ionicons name="person-outline" size={18} color="rgba(255,255,255,0.4)" />
              <TextInput
                style={styles.input}
                placeholder="e.g. Robert"
                placeholderTextColor="#8aa0c6"
                value={firstName}
                onChangeText={setFirstName}
                autoCapitalize="words"
              />
            </View>
            <Text style={styles.inputLabel}>Last name</Text>
            <View style={[styles.inputContainer, { borderColor: '#1b2534' }]}>
              <Ionicons name="person-outline" size={18} color="rgba(255,255,255,0.4)" />
              <TextInput
                style={styles.input}
                placeholder="e.g. Miller"
                placeholderTextColor="#8aa0c6"
                value={lastName}
                onChangeText={setLastName}
                autoCapitalize="words"
              />
            </View>
          </View>

          <View style={styles.codeSection}>
            <Text style={styles.codeLabel}>6-digit invite code</Text>
            <Animated.View style={[styles.codeRow, { transform: [{ scale: pulse }] }]}>
              {codeDigits.map((digit, index) => (
                <TextInput
                  key={`digit-${index}`}
                ref={(ref) => {
                  codeRefs.current[index] = ref;
                }}
                  style={[
                    styles.codeBox,
                    { borderColor: digit ? '#2d6df6' : '#1b2534' },
                  ]}
                  keyboardType="number-pad"
                  maxLength={1}
                  value={digit}
                  onChangeText={(value) => handleDigitChange(value, index)}
                  onKeyPress={(event) => handleKeyPress(event, index)}
                  textAlign="center"
                  autoFocus={index === 0}
                />
              ))}
            </Animated.View>
          </View>

          {message ? <Text style={styles.message}>{message}</Text> : null}
        </ScrollView>

        <ActionFooter
          primaryLabel="Connect to Circle"
          onPrimaryPress={acceptCode}
          primaryLoading={isSubmitting}
          primaryDisabled={!isCodeComplete || isSubmitting}
        />
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    backgroundColor: '#0b111b',
  },
  screen: {
    flex: 1,
    backgroundColor: '#0b111b',
  },
  body: {
    paddingHorizontal: 32,
    paddingBottom: 20,
  },
  title: {
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -0.35,
    color: '#f5f7fb',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 17,
    fontWeight: '500',
    color: '#8aa0c6',
    maxWidth: 320,
  },
  inputGroup: {
    marginTop: 32,
    gap: 16,
  },
  inputLabel: {
    fontSize: 12,
    letterSpacing: 0.6,
    color: '#8aa0c6',
    marginBottom: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 60,
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 12,
    gap: 12,
    backgroundColor: '#121a26',
  },
  input: {
    flex: 1,
    color: '#fff',
  },
  codeSection: {
    marginTop: 32,
    gap: 12,
  },
  codeLabel: {
    fontSize: 12,
    letterSpacing: 0.6,
    color: '#8aa0c6',
    marginBottom: 4,
  },
  codeRow: {
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'flex-start',
    width: '100%',
  },
  codeBox: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: '#121a26',
    borderWidth: 2,
    borderColor: '#1b2534',
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
  },
  message: {
    marginTop: 16,
    color: '#ff8a8a',
    fontSize: 12,
    textAlign: 'center',
  },
  actionContainer: {
    paddingHorizontal: 32,
    paddingBottom: 24,
  },
  actionButton: {
    height: 60,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#2d6df6',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 30,
  },
  actionText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
});
