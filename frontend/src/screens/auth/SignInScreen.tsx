import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { useAuth } from '../../context/AuthContext';

export default function SignInScreen({ navigation }: { navigation: any }) {
  const { signIn, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    setError('');
    setIsSubmitting(true);
    const message = await signIn(email.trim(), password);
    if (message) {
      setError(message);
    }
    setIsSubmitting(false);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.title}>SafeCall</Text>
        <Text style={styles.subtitle}>Sign in to protect your loved one</Text>

        <TextInput
          placeholder="Email"
          placeholderTextColor="#9aa3b2"
          autoCapitalize="none"
          keyboardType="email-address"
          style={styles.input}
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          placeholder="Password"
          placeholderTextColor="#9aa3b2"
          secureTextEntry
          style={styles.input}
          value={password}
          onChangeText={setPassword}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity style={styles.primaryButton} onPress={handleSubmit} disabled={isSubmitting}>
          <Text style={styles.primaryButtonText}>{isSubmitting ? 'Signing in…' : 'Sign In'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={signInWithGoogle}>
          <Text style={styles.secondaryButtonText}>Continue with Google</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('SignUp')}>
          <Text style={styles.link}>Create an account</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b111b',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#121a26',
    borderRadius: 18,
    padding: 24,
    gap: 14,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#f5f7fb',
  },
  subtitle: {
    fontSize: 14,
    color: '#b5c0d3',
  },
  input: {
    borderWidth: 1,
    borderColor: '#243247',
    borderRadius: 12,
    padding: 12,
    color: '#e6ebf5',
  },
  primaryButton: {
    backgroundColor: '#2d6df6',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#f5f7fb',
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: '#1a2333',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2b3c57',
  },
  secondaryButtonText: {
    color: '#d2daea',
    fontWeight: '600',
  },
  link: {
    color: '#8ab4ff',
    textAlign: 'center',
    marginTop: 6,
  },
  error: {
    color: '#ff8a8a',
    fontSize: 12,
  },
});
