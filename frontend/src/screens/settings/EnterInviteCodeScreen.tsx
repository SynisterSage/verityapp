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
import { useProfile } from '../../context/ProfileContext';
import { authorizedFetch } from '../../services/backend';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';

import SettingsHeader from '../../components/common/SettingsHeader';
import ActionFooter from '../../components/onboarding/ActionFooter';
import { withOpacity } from '../../utils/color';
import type { AppTheme } from '../../theme/tokens';

const CODE_LENGTH = 6;

export default function EnterInviteCodeScreen() {
  const navigation = useNavigation();
  const { theme } = useTheme();
  const styles = useMemo(() => createEnterInviteCodeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const { refreshProfiles, setOnboardingComplete } = useProfile();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [codeDigits, setCodeDigits] = useState(Array(CODE_LENGTH).fill(''));
  const firstNameRef = useRef<TextInput | null>(null);
  const lastNameRef = useRef<TextInput | null>(null);
  const codeRefs = useRef<Array<TextInput | null>>(Array(CODE_LENGTH).fill(null));
  const pulse = useRef(new Animated.Value(1)).current;

  const codeValue = useMemo(() => codeDigits.join(''), [codeDigits]);
  const isCodeComplete = codeDigits.every((digit) => digit.length === 1);
  const areNamesEntered = firstName.trim() && lastName.trim();

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
    if (!areNamesEntered) {
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

  const placeholderColor = useMemo(
    () => withOpacity(theme.colors.textMuted, 0.65),
    [theme.colors.textMuted]
  );
  const iconColor = useMemo(() => withOpacity(theme.colors.text, 0.55), [theme.colors.text]);

  return (
    <View style={styles.outer}>
      <SafeAreaView style={styles.screen} edges={[]}>
        <SettingsHeader title="Enter invite code" subtitle="Tap the code shared with you to join." />
        <ScrollView
          contentContainerStyle={[
            styles.body,
            {
              paddingBottom: Math.max(insets.bottom, 32) + 220,
              paddingTop: Math.max(insets.top, 12) + 0,

            },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
        >
          <View style={styles.inputGroup}>

            <Text style={styles.inputLabel}>First name</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="person-outline" size={18} color={iconColor} />
              <TextInput
                style={styles.input}
                placeholder="e.g. Robert"
                placeholderTextColor={placeholderColor}
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
              <Ionicons name="person-outline" size={18} color={iconColor} />
              <TextInput
                style={styles.input}
                placeholder="e.g. Miller"
                placeholderTextColor={placeholderColor}
                value={lastName}
                onChangeText={setLastName}
                autoCapitalize="words"
                ref={lastNameRef}
                returnKeyType="next"
                onSubmitEditing={() => codeRefs.current[0]?.focus()}
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
                  {
                    borderColor: digit ? theme.colors.accent : withOpacity(theme.colors.text, 0.15),
                  },
                ]}
                  keyboardType="number-pad"
                  maxLength={1}
                  value={digit}
                  onChangeText={(value) => handleDigitChange(value, index)}
                  onKeyPress={(event) => handleKeyPress(event, index)}
                  textAlign="center"
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
          primaryDisabled={!areNamesEntered || !isCodeComplete || isSubmitting}
          secondaryLabel="Never mind"
          onSecondaryPress={() => navigation.goBack()}
        />
      </SafeAreaView>
    </View>
  );
}

const createEnterInviteCodeStyles = (theme: AppTheme) =>
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
      paddingHorizontal: 24,
      flexGrow: 1,
      gap: 24,
    },
    inputGroup: {
      gap: 12,
      marginBottom: 24,
    },
    inputLabel: {
      fontSize: 12,
      letterSpacing: 1.5,
      color: theme.colors.textMuted,
      marginBottom: 6,
      textTransform: 'uppercase',
    },
    inputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 16,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 12,
      height: 52,
      gap: 8,
    },
    input: {
      flex: 1,
      color: theme.colors.text,
      fontSize: 16,
    },
    codeSection: {
      marginBottom: 20,
    },
    codeLabel: {
      fontSize: 12,
      letterSpacing: 1.5,
      color: theme.colors.textMuted,
      marginBottom: 12,
      textTransform: 'uppercase',
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
      borderWidth: 2,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      color: theme.colors.text,
      fontSize: 24,
      fontWeight: '700',
    },
    message: {
      color: theme.colors.danger,
      marginTop: 4,
    },
  });
