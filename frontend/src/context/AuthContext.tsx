import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { Linking } from 'react-native';

import { Session } from '@supabase/supabase-js';

import { supabase } from '../services/supabase';

export type SignUpResult = {
  error: string | null;
  needsConfirmation?: boolean;
};

type AuthContextValue = {
  session: Session | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<SignUpResult>;
  sendPasswordReset: (email: string) => Promise<string | null>;
  signInWithGoogle: () => Promise<string | null>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Complete auth sessions in Expo
WebBrowser.maybeCompleteAuthSession();

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const handleOAuthRedirect = async (url: string) => {
    const hash = url.split('#')[1] ?? '';
    if (hash) {
      const params = new URLSearchParams(hash);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      if (accessToken && refreshToken) {
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) {
          console.warn('setSession error', error.message);
        } else if (data?.session) {
          setSession(data.session);
        }
        return;
      }
    }

    const { data, error } = await supabase.auth.exchangeCodeForSession(url);
    if (error) {
      console.warn('exchangeCodeForSession error', error.message);
    } else if (data?.session) {
      setSession(data.session);
    }
  };

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session ?? null);
        setIsLoading(false);
      }
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  // Handle deep links from OAuth
  useEffect(() => {
    const handler = async (event: { url: string }) => {
      try {
        await handleOAuthRedirect(event.url);
      } catch (err) {
        console.warn('OAuth redirect handling failed', err);
      }
    };
    const subscription = Linking.addEventListener('url', handler);
    return () => subscription.remove();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isLoading,
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return error ? error.message : null;
      },
      signUp: async (email, password) => {
        const { data, error } = await supabase.auth.signUp({ email, password });
        return {
          error: error ? error.message : null,
          needsConfirmation: !error && !data?.session,
        };
      },
      sendPasswordReset: async (email) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: 'exp://192.168.1.174:8081/--/auth/callback',
        });
        return error ? error.message : null;
      },
      signInWithGoogle: async () => {
        const redirectTo = 'exp://192.168.1.174:8081/--/auth/callback';
        console.log('OAuth redirectTo', redirectTo);
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo },
        });
        if (error) {
          console.warn('signInWithOAuth error', error.message);
          return error.message;
        }
        if (data?.url) {
          console.log('OAuth url', data.url);
          const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
          if (result.type === 'success' && result.url) {
            try {
              await handleOAuthRedirect(result.url);
            } catch (err) {
              console.warn('OAuth session handling failed', err, {
                redirectTo,
                returnedUrl: result.url,
              });
            }
          } else {
            console.warn('OAuth session result', result);
          }
        }
        return null;
      },
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [session, isLoading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
