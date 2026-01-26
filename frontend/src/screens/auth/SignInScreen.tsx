import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import ActionFooter from '../../components/onboarding/ActionFooter';

export default function SignInScreen({ navigation }: { navigation: any }) {
  const { signIn, signInWithGoogle, sendPasswordReset } = useAuth();
  const { theme } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState<null | { text: string; type: 'error' | 'info' }>(null);
  const [focusField, setFocusField] = useState<'email' | 'password' | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const insets = useSafeAreaInsets();
  const handleSubmit = async () => {
    setLoginError('');
    setIsSubmitting(true);
    const message = await signIn(email.trim(), password);
    if (message) {
      setLoginError(message);
    }
    setIsSubmitting(false);
  };

  const handlePasswordReset = async () => {
    if (!email.trim()) {
      setResetMessage({ text: 'Enter your email to reset the password.', type: 'error' });
      return;
    }
    setIsResetting(true);
    const error = await sendPasswordReset(email.trim());
    if (error) {
      setResetMessage({ text: error, type: 'error' });
    } else {
      setResetMessage({
        text: `We just sent password reset instructions to ${email.trim()}.`,
        type: 'info',
      });
    }
    setIsResetting(false);
  };

  const inputBorderColor = (field: 'email' | 'password') =>
    focusField === field ? theme.colors.accent : theme.colors.border;

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
      <View style={styles.content}>
        <View>
          <Text style={[styles.title, { color: theme.colors.text, fontFamily: theme.typography.fontFamily }]}>
            Welcome Back
          </Text>
          <Text
            style={[
              styles.subtitle,
              { color: theme.colors.textMuted, fontFamily: theme.typography.fontFamily },
            ]}
          >
            Sign in to your secure account.
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
                <Svg
                  width={22}
                  height={22}
                  viewBox="0 0 24 24"
                  style={styles.eyeIcon}
                  fill="none"
                  stroke={showPassword ? theme.colors.accent : theme.colors.textMuted}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <Path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
                  <Path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
                  {showPassword ? null : <Path d="M4 4l16 16" />}
                </Svg>
              </Pressable>
            </View>
          </View>

        <TouchableOpacity
          style={[styles.forgotButton, { alignSelf: 'flex-end' }]}
          onPress={handlePasswordReset}
        >
          <Text style={[styles.forgotText, { color: theme.colors.accent, opacity: isResetting ? 0.6 : 1 }]}>
            {isResetting ? 'Sending reset link…' : 'Forgot Password?'}
          </Text>
        </TouchableOpacity>
        {resetMessage ? (
          <View
            style={[
              styles.resetMessage,
              {
                borderColor:
                  resetMessage.type === 'error' ? theme.colors.danger : theme.colors.success,
                backgroundColor:
                  resetMessage.type === 'error'
                    ? 'rgba(225, 29, 72, 0.08)'
                    : 'rgba(16, 185, 129, 0.08)',
              },
            ]}
          >
            <Text
              style={[
                styles.resetMessageText,
                {
                  color: resetMessage.type === 'error' ? theme.colors.danger : theme.colors.success,
                },
              ]}
            >
              {resetMessage.text}
            </Text>
          </View>
        ) : null}
        {loginError ? (
          <View
            style={[
              styles.loginError,
              {
                borderColor: theme.colors.danger,
                backgroundColor: 'rgba(225, 29, 72, 0.08)',
              },
            ]}
          >
            <Text style={[styles.loginErrorText, { color: theme.colors.danger }]}>{loginError}</Text>
          </View>
        ) : null}
        </View>
      </View>

      <ActionFooter
        primaryLabel={isSubmitting ? 'Signing In…' : 'Sign In'}
        onPrimaryPress={handleSubmit}
        primaryLoading={isSubmitting}
        secondaryLabel="Continue with Google"
        onSecondaryPress={signInWithGoogle}
        helperPrefix="New to Verity?"
        helperActionLabel="Join Now"
        onHelperPress={() => navigation.navigate('SignUp')}
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
  content: {
    flex: 1,
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
  eyeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  forgotButton: {
    marginTop: 2,
  },
  forgotText: {
    fontSize: 15,
    fontWeight: '700',
  },
  resetMessage: {
    fontSize: 12,
    marginTop: 12,
    padding: 10,
    borderWidth: 1,
    borderRadius: 12,
  },
  resetMessageText: {
    fontSize: 12,
  },
  error: {
    fontSize: 12,
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
  loginError: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
    backgroundColor: 'rgba(225, 29, 72, 0.08)',
    marginTop: 14,
  },
  loginErrorText: {
    fontSize: 14,
  },
  eyeIcon: {
    marginRight: 4,
  },
});
