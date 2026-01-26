import { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';

import { useTheme } from '../../context/ThemeContext';
import { SignUpResult, useAuth } from '../../context/AuthContext';
import ActionFooter from '../../components/onboarding/ActionFooter';

type AlertState = {
  message: string;
  type: 'warning' | 'danger';
};

export default function SignUpScreen({ navigation }: { navigation: any }) {
  const { signUp, signInWithGoogle } = useAuth();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [focusField, setFocusField] = useState<'email' | 'password' | 'confirm' | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [alert, setAlert] = useState<AlertState | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const inputBorderColor = (field: 'email' | 'password' | 'confirm') =>
    focusField === field ? theme.colors.accent : theme.colors.border;
  const isLengthValid = password.length >= 8;
  const hasLetter = /[A-Za-z]/.test(password);
  const hasSpecialChar = /[^A-Za-z0-9]/.test(password);
  const passwordCriteria = useMemo(
    () => [
      { label: 'At least 8 characters', met: isLengthValid },
      { label: 'Includes a letter', met: hasLetter },
      { label: 'Includes a special character', met: hasSpecialChar },
    ],
    [hasLetter, hasSpecialChar, isLengthValid]
  );

  const handleSubmit = async () => {
    setAlert(null);

    if (!acceptedLegal) {
      setAlert({
        message: 'Please agree to the terms of service and privacy policy before creating an account.',
        type: 'warning',
      });
      return;
    }

    if (password !== confirmPassword) {
      setAlert({ message: 'Passwords must match.', type: 'warning' });
      return;
    }

    const hasLetter = /[A-Za-z]/.test(password);
    const hasSpecial = /[^A-Za-z0-9]/.test(password);

    if (password.length < 8 || !hasLetter || !hasSpecial) {
      setAlert({
        message:
          'Password must be at least 8 characters and include a letter and a special character.',
        type: 'warning',
      });
      return;
    }

    setIsSubmitting(true);
    const result = await signUp(email.trim(), password);
    setIsSubmitting(false);

    if (result.error) {
      setAlert({ message: result.error, type: 'danger' });
      return;
    }
    if (result.needsConfirmation) {
      navigation.navigate('ConfirmEmail', { email: email.trim() });
      return;
    }
  };

  const renderEye = (visible: boolean) => (
    <Svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      style={styles.eyeIcon}
      fill="none"
      stroke={visible ? theme.colors.accent : theme.colors.textMuted}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
      <Path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
      {visible ? null : <Path d="M4 4l16 16" />}
    </Svg>
  );

  const alertColor = alert?.type === 'warning' ? theme.colors.warning : theme.colors.danger;
  const alertBg =
    alert?.type === 'warning' ? 'rgba(245, 158, 11, 0.08)' : 'rgba(225, 29, 72, 0.08)';

  const alertSpacing = alert ? 40 : 24;
  const scrollPaddingBottom = Math.max(insets.bottom, 32) + 80 + alertSpacing;
  const bottomBuffer = scrollPaddingBottom + 64;

  return (
    <SafeAreaView
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.bg,
          paddingTop: 24 + insets.top,
          paddingBottom: 24 + insets.bottom,
        },
      ]}
      edges={['bottom']}
    >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: bottomBuffer },
          ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View>
          <Text style={[styles.title, { color: theme.colors.text, fontFamily: theme.typography.fontFamily }]}>
            Start Today
          </Text>
          <Text
            style={[
              styles.subtitle,
              { color: theme.colors.textMuted, fontFamily: theme.typography.fontFamily },
            ]}
          >
            Create your Verity account.
          </Text>
        </View>

        <View style={styles.fields}>
          <View style={styles.fieldWrapper}>
            <Text style={[styles.fieldLabel, { color: theme.colors.textDim }]}>Email</Text>
            <TextInput
              placeholder="name@email.com"
              placeholderTextColor={theme.colors.textDim}
              autoCapitalize="none"
              keyboardType="email-address"
              style={[
                styles.input,
                {
                  borderColor: inputBorderColor('email'),
                  backgroundColor: theme.colors.surfaceAlt,
                  color: theme.colors.text,
                },
              ]}
              value={email}
              onChangeText={setEmail}
              onFocus={() => setFocusField('email')}
              onBlur={() => setFocusField((prev) => (prev === 'email' ? null : prev))}
            />
          </View>

        <View style={styles.fieldWrapper}>
          <Text style={[styles.fieldLabel, { color: theme.colors.textDim }]}>Password</Text>
          <View style={styles.passwordRow}>
            <TextInput
                placeholder="••••••••"
                placeholderTextColor={theme.colors.textDim}
                secureTextEntry={!showPassword}
                style={[
                  styles.input,
                  {
                    borderColor: inputBorderColor('password'),
                    backgroundColor: theme.colors.surfaceAlt,
                    color: theme.colors.text,
                    paddingRight: 60,
                  },
                ]}
                value={password}
                onChangeText={setPassword}
                onFocus={() => setFocusField('password')}
                onBlur={() => setFocusField((prev) => (prev === 'password' ? null : prev))}
            />
            <Pressable
              style={styles.eyeButton}
                onPress={() => setShowPassword((prev) => !prev)}
                android_ripple={{ color: 'rgba(255,255,255,0.15)', borderless: true }}
              >
                {renderEye(showPassword)}
              </Pressable>
          </View>
        </View>

          <View style={styles.fieldWrapper}>
          <Text style={[styles.fieldLabel, { color: theme.colors.textDim }]}>Confirm password</Text>
          <View style={styles.passwordRow}>
            <TextInput
                placeholder="••••••••"
                placeholderTextColor={theme.colors.textDim}
                secureTextEntry={!showConfirm}
                style={[
                  styles.input,
                  {
                    borderColor: inputBorderColor('confirm'),
                    backgroundColor: theme.colors.surfaceAlt,
                    color: theme.colors.text,
                    paddingRight: 60,
                  },
                ]}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                onFocus={() => setFocusField('confirm')}
                onBlur={() => setFocusField((prev) => (prev === 'confirm' ? null : prev))}
            />
            <Pressable
              style={styles.eyeButton}
              onPress={() => setShowConfirm((prev) => !prev)}
              android_ripple={{ color: 'rgba(255,255,255,0.15)', borderless: true }}
            >
              {renderEye(showConfirm)}
            </Pressable>
          </View>
        <View style={styles.criteriaList}>
          {passwordCriteria.map((item) => (
            <View key={item.label} style={styles.criteriaRow}>
              <Ionicons
                name={item.met ? 'checkmark-circle' : 'ellipse-outline'}
                size={16}
                color={item.met ? theme.colors.success : theme.colors.textDim}
                style={styles.criteriaIcon}
              />
              <Text
                style={[
                  styles.criteriaText,
                  { color: item.met ? theme.colors.text : theme.colors.textDim },
                ]}
              >
                {item.label}
              </Text>
            </View>
          ))}
        </View>
        <View style={styles.checkboxRow}>
          <Pressable
            style={styles.checkbox}
            onPress={() => setAcceptedLegal((prev) => !prev)}
          >
            <Ionicons
              name={acceptedLegal ? 'checkmark-circle' : 'ellipse-outline'}
              size={20}
              color={acceptedLegal ? theme.colors.accent : theme.colors.textDim}
            />
            <Text style={[styles.checkboxText, { color: theme.colors.text }]}>
              I agree to the{' '}
              <Text
                style={[styles.linkText, { color: theme.colors.accent }]}
                onPress={() => Linking.openURL('https://verityprotect.com/terms')}
              >
                Terms of Service
              </Text>{' '}
              and{' '}
              <Text
                style={[styles.linkText, { color: theme.colors.accent }]}
                onPress={() => Linking.openURL('https://verityprotect.com/privacy')}
              >
                Privacy Policy
              </Text>
            </Text>
          </Pressable>
        </View>
        </View>

          {alert ? (
            <View
              style={[
                styles.loginError,
                {
                  borderColor: alertColor,
                  backgroundColor: alertBg,
                  marginTop: 14,
                },
              ]}
            >
              <Text style={[styles.loginErrorText, { color: alertColor }]}>{alert.message}</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <ActionFooter
        primaryLabel={isSubmitting ? 'Creating…' : 'Create Account'}
        onPrimaryPress={handleSubmit}
        primaryLoading={isSubmitting}
        primaryDisabled={!acceptedLegal}
        secondaryLabel="Continue with Google"
        onSecondaryPress={signInWithGoogle}
        helperPrefix="Already have an account?"
        helperActionLabel="Sign In"
        onHelperPress={() => navigation.navigate('SignIn')}
        secondaryIcon={
          <View style={styles.googleIcon}>
            <Text style={styles.googleIconText}>G</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 0,
  },
  scroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    minHeight: '100%',
    justifyContent: 'flex-start',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    lineHeight: 36,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 22,
  },
  fields: {
    marginTop: 32,
    marginBottom: 36,
  },
  fieldWrapper: {
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 13,
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  criteriaList: {
    marginTop: 12,
    paddingLeft: 4,
    gap: 4,
  },
  criteriaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  criteriaIcon: {
    marginTop: 2,
  },
  criteriaText: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  input: {
    height: 60,
    borderWidth: 1,
    borderRadius: 24,
    paddingHorizontal: 20,
    fontSize: 16,
  },
  passwordRow: {
    position: 'relative',
  },
  eyeButton: {
    position: 'absolute',
    right: 16,
    top: 14,
    height: 32,
    width: 64,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  eyeIcon: {
    marginRight: 4,
  },
  loginError: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    marginBottom: 0,
    marginTop: 8,
    backgroundColor: 'rgba(225, 29, 72, 0.08)',
  },
  loginErrorText: {
    fontSize: 14,
  },
  googleIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  googleIconText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2d6df6',
  },
  checkboxRow: {
    marginTop: 4,
    marginBottom: -10,
    left: 2,
  },
  checkbox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    flexWrap: 'wrap',
  },
  checkboxText: {
    fontSize: 12,
    letterSpacing: 0.2,
    lineHeight: 20,
    right: 1,
  },
  linkText: {
    textDecorationLine: 'underline',
  },
});
