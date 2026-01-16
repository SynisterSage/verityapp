import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  Dispatch,
  MutableRefObject,
  SetStateAction,
} from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { authorizedFetch } from '../../services/backend';
import { useProfile } from '../../context/ProfileContext';
import HowItWorksCard from '../../components/onboarding/HowItWorksCard';
import OnboardingHeader from '../../components/onboarding/OnboardingHeader';

const PIN_LENGTH = 6;

const formatDigits = (digits: string[]) => digits.join('');

export default function PasscodeScreen({ navigation }: { navigation: any }) {
  const { activeProfile, setActiveProfile } = useProfile();
  const insets = useSafeAreaInsets();
  const [createDigits, setCreateDigits] = useState<string[]>(Array(PIN_LENGTH).fill(''));
  const [confirmDigits, setConfirmDigits] = useState<string[]>(Array(PIN_LENGTH).fill(''));
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const createRefs = useRef<Array<TextInput | null>>(Array(PIN_LENGTH).fill(null));
  const confirmRefs = useRef<Array<TextInput | null>>(Array(PIN_LENGTH).fill(null));
  const mismatchRef = useRef(false);

  const createValue = useMemo(() => formatDigits(createDigits), [createDigits]);
  const confirmValue = useMemo(() => formatDigits(confirmDigits), [confirmDigits]);
  const createComplete = createValue.length === PIN_LENGTH;
  const confirmComplete = confirmValue.length === PIN_LENGTH;
  const isMatch = createComplete && confirmComplete && createValue === confirmValue;
  const isMismatch = createComplete && confirmComplete && createValue !== confirmValue;
  const canActivate = isMatch && createComplete && confirmComplete;

  const triggerShake = useCallback(() => {
    mismatchRef.current = true;
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: -8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -6, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);

  useEffect(() => {
    if (isMismatch && !mismatchRef.current) {
      setError('Passcodes do not match.');
      triggerShake();
    } else if (!isMismatch) {
      mismatchRef.current = false;
      setError('');
    }
  }, [isMismatch, triggerShake]);

  useEffect(() => {
    if (createComplete) {
      confirmRefs.current[0]?.focus();
    }
  }, [createComplete]);

  const updateDigits = (
    index: number,
    value: string,
    digits: string[],
    setDigits: Dispatch<SetStateAction<string[]>>,
    refs: MutableRefObject<Array<TextInput | null>>
  ) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    setDigits((prev) => {
      const next = [...prev];
      next[index] = digit;
      return next;
    });
    if (digit && index < PIN_LENGTH - 1) {
      refs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (
    event: any,
    index: number,
    digits: string[],
    setDigits: Dispatch<SetStateAction<string[]>>,
    refs: MutableRefObject<Array<TextInput | null>>
  ) => {
    if (event.nativeEvent.key === 'Backspace' && !digits[index] && index > 0) {
      refs.current[index - 1]?.focus();
      setDigits((prev) => {
        const next = [...prev];
        next[index - 1] = '';
        return next;
      });
    }
  };

  const howCardItems = [
    { icon: 'people-outline', color: '#4ade80', text: 'Trusted contacts always skip the code.' },
    { icon: 'shield-checkmark-outline', color: '#2d6df6', text: 'Unknown callers must enter the PIN.' },
  ];

  const handleContinue = async () => {
    if (!activeProfile) {
      setError('Profile not found.');
      return;
    }
    if (!canActivate) {
      setError('Complete matching 6-digit PINs.');
      return;
    }
    setError('');
    setIsSubmitting(true);
    try {
      await authorizedFetch(`/profiles/${activeProfile.id}/passcode`, {
        method: 'POST',
        body: JSON.stringify({ pin: createValue }),
      });
      setActiveProfile({ ...activeProfile, has_passcode: true });
      navigation.navigate('OnboardingTrustedContacts');
    } catch (err: any) {
      setError(err?.message || 'Failed to save passcode.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderPinBoxes = (
    digits: string[],
    setDigits: Dispatch<SetStateAction<string[]>>,
    refs: MutableRefObject<Array<TextInput | null>>,
    disabled = false,
    borderColor?: string,
    autoFocusFirst = false
  ) => (
    <View style={styles.pinRow}>
      {digits.map((digit, index) => (
        <TextInput
          key={`pin-${index}`}
          ref={(ref) => {
            refs.current[index] = ref;
          }}
          style={[
            styles.pinBox,
            { borderColor: borderColor ?? (digit ? '#2d6df6' : '#1b2534') },
            disabled && styles.pinBoxDisabled,
          ]}
          keyboardType="number-pad"
          maxLength={1}
          value={showPin ? digit : digit ? '•' : ''}
          onChangeText={(value) => updateDigits(index, value, digits, setDigits, refs)}
          onKeyPress={(event) => handleKeyPress(event, index, digits, setDigits, refs)}
          secureTextEntry={!showPin}
          editable={!disabled}
          autoFocus={autoFocusFirst && index === 0}
        />
      ))}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.outer}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <SafeAreaView style={styles.screen} edges={['bottom']}>
        <OnboardingHeader chapter="Security" activeStep={4} totalSteps={9} />
        <ScrollView
          contentContainerStyle={[
            styles.body,
            {
              paddingBottom: 32 + Math.max(insets.bottom, 24),
            },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.title}>Safety PIN</Text>
            <Text style={styles.subtitle}>
              Create a 6-digit code to protect your phone from unknown callers.
            </Text>
          </View>

          <View style={styles.pinSection}>
            <View style={styles.pinHeader}>
              <Text style={styles.pinLabel}>Create PIN</Text>
              <Pressable onPress={() => setShowPin((prev) => !prev)}>
                <Text style={styles.toggleText}>{showPin ? 'Hide' : 'Show'}</Text>
              </Pressable>
            </View>
            {renderPinBoxes(createDigits, setCreateDigits, createRefs, false, undefined, true)}
          </View>

          <View
            style={[
              styles.pinSection,
              {
                opacity: createComplete ? 1 : 0.1,
              },
            ]}
            pointerEvents={createComplete ? 'auto' : 'none'}
          >
            <View style={styles.pinHeader}>
              <Text style={styles.pinLabel}>Confirm PIN</Text>
              <Text style={styles.helperText}>Match previous PIN</Text>
            </View>
            <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
              {renderPinBoxes(
                confirmDigits,
                setConfirmDigits,
                confirmRefs,
                !createComplete,
                isMismatch ? '#e11d48' : undefined
              )}
            </Animated.View>
          </View>

          <HowItWorksCard items={howCardItems} />

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </ScrollView>

        <View style={styles.actionContainer}>
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              {
                opacity: canActivate && !isSubmitting ? (pressed ? 0.95 : 1) : 0.3,
                backgroundColor: '#2d6df6',
              },
            ]}
            onPress={handleContinue}
            disabled={!canActivate || isSubmitting}
          >
            <Text style={styles.primaryButtonText}>
              {isSubmitting ? 'Activating…' : 'Activate Protection'}
            </Text>
          </Pressable>
        </View>
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
    paddingTop: 28,
  },
  header: {
    marginBottom: 32,
  },
  title: {
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -0.35,
    color: '#f5f7fb',
    lineHeight: 40,
    maxWidth: 320,
  },
  subtitle: {
    fontSize: 17,
    fontWeight: '500',
    color: '#8aa0c6',
    marginTop: 8,
    maxWidth: 320,
  },
  pinSection: {
    marginBottom: 28,
  },
  pinHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  pinLabel: {
    fontSize: 12,
    letterSpacing: 0.6,
    color: '#8aa0c6',
    fontWeight: '700',
  },
  helperText: {
    fontSize: 12,
    letterSpacing: 0.6,
    color: '#4d5d85',
    fontWeight: '600',
  },
  toggleText: {
    fontSize: 12,
    letterSpacing: 0.6,
    color: '#2d6df6',
    fontWeight: '700',
  },
  pinRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  pinBox: {
    width: 46,
    aspectRatio: 1,
    borderRadius: 24,
    backgroundColor: '#1a2333',
    borderWidth: 1,
    borderColor: '#1b2534',
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    padding: 0,
  },
  pinBoxDisabled: {
    backgroundColor: '#111628',
  },
  error: {
    color: '#ff8a8a',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 12,
  },
  actionContainer: {
    paddingHorizontal: 32,
    paddingBottom: 32,
  },
  primaryButton: {
    height: 60,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
});
