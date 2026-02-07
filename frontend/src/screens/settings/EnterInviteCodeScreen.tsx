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

const CODE_LENGTH = 8;

export default function EnterInviteCodeScreen() {
  const navigation = useNavigation();
  const { theme } = useTheme();
  const styles = useMemo(() => createEnterInviteCodeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const { activeProfile, profiles, refreshProfiles, setActiveProfile, setOnboardingComplete } = useProfile();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [code, setCode] = useState('');
  const firstNameRef = useRef<TextInput | null>(null);
  const lastNameRef = useRef<TextInput | null>(null);
  const codeInputRef = useRef<TextInput | null>(null);
  const prefilledProfileIdRef = useRef<string | null>(null);
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

  useEffect(() => {
    if (
      !activeProfile ||
      !activeProfile.first_name ||
      !activeProfile.last_name ||
      prefilledProfileIdRef.current === activeProfile.id ||
      firstName.length > 0 ||
      lastName.length > 0
    ) {
      return;
    }
    setFirstName(activeProfile.first_name);
    setLastName(activeProfile.last_name);
    prefilledProfileIdRef.current = activeProfile.id;
  }, [activeProfile, firstName, lastName]);

  const sanitizeCode = (value: string) =>
    value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, CODE_LENGTH);

  const formatDisplayValue = (value: string) => {
    if (value.length <= 4) {
      return value;
    }
    return `${value.slice(0, 4)}-${value.slice(4)}`;
  };

  const handleCodeChange = (text: string) => {
    setCode(sanitizeCode(text));
  };

  const acceptCode = async () => {
    if (!areNamesEntered) {
      setMessage('Add your first and last name.');
      return;
    }
    if (!isCodeComplete) {
      setMessage('Fill the 8-character code.');
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
      
      // Find and switch to the newly joined profile
      // It should be one that the user is a member of but not the caretaker
      if (profiles && profiles.length > 0) {
        // Look for a profile that's not the currently active one
        const joinedProfile = profiles.find((p) => p.id !== activeProfile?.id && p.id);
        if (joinedProfile) {
          setActiveProfile(joinedProfile);
        }
      }
      
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
    codeInputWrapper: {
      width: '100%',
      height: 64,
      borderRadius: 18,
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
      color: theme.colors.danger,
      marginTop: 4,
    },
  });
