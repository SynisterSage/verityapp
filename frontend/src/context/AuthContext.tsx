import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { Session } from '@supabase/supabase-js';

import { supabase } from '../services/supabase';

export type SignUpResult = {
  error: string | null;
  needsConfirmation?: boolean;
};

export type LegalAcceptancePayload = {
  termsVersion: string;
  privacyVersion: string;
  acceptedAt: string;
  source?: string;
  metadata?: Record<string, unknown>;
};

const PENDING_LEGAL_ACCEPTANCE_KEY = 'auth:pending-legal-acceptance';

type AuthContextValue = {
  session: Session | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (
    email: string,
    password: string,
    legalAcceptance?: LegalAcceptancePayload
  ) => Promise<SignUpResult>;
  sendPasswordReset: (email: string) => Promise<string | null>;
  signInWithGoogle: () => Promise<string | null>;
  signInWithApple: () => Promise<string | null>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Complete auth sessions in Expo
WebBrowser.maybeCompleteAuthSession();

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const recordLegalAcceptance = async (
    accessToken: string,
    payload: LegalAcceptancePayload
  ) => {
    const baseUrl =
      process.env.EXPO_PUBLIC_API_URL ?? process.env.EXPO_PUBLIC_API_BASE_URL ?? '';
    if (!baseUrl) {
      return;
    }

    const response = await fetch(`${baseUrl}/auth/legal-acceptance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        terms_version: payload.termsVersion,
        privacy_version: payload.privacyVersion,
        accepted_at: payload.acceptedAt,
        source: payload.source ?? 'mobile_signup',
        metadata: payload.metadata ?? {},
      }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const message =
        (typeof body?.error === 'string' && body.error) ||
        `legal acceptance request failed (${response.status})`;
      throw new Error(message);
    }
  };

  const cachePendingLegalAcceptance = async (
    userId: string,
    payload: LegalAcceptancePayload
  ) => {
    try {
      await AsyncStorage.setItem(
        PENDING_LEGAL_ACCEPTANCE_KEY,
        JSON.stringify({
          userId,
          ...payload,
        })
      );
    } catch (error) {
      console.warn('Failed to cache pending legal acceptance', error);
    }
  };

  const flushPendingLegalAcceptance = async (activeSession: Session) => {
    try {
      const raw = await AsyncStorage.getItem(PENDING_LEGAL_ACCEPTANCE_KEY);
      if (!raw) {
        return;
      }

      const pending = JSON.parse(raw) as
        | (LegalAcceptancePayload & { userId?: string })
        | null;
      if (!pending) {
        return;
      }

      const pendingUserId = pending.userId;
      if (pendingUserId && pendingUserId !== activeSession.user.id) {
        return;
      }

      await recordLegalAcceptance(activeSession.access_token, {
        termsVersion: pending.termsVersion,
        privacyVersion: pending.privacyVersion,
        acceptedAt: pending.acceptedAt,
        source: pending.source,
        metadata: pending.metadata,
      });
      await AsyncStorage.removeItem(PENDING_LEGAL_ACCEPTANCE_KEY);
    } catch (error) {
      console.warn('Failed to flush legal acceptance', error);
    }
  };

  const handleOAuthRedirect = async (url: string) => {
    if (!url) return;

    const query = url.includes('?') ? url.slice(url.indexOf('?') + 1).split('#')[0] : '';
    const hash = url.includes('#') ? url.split('#')[1] ?? '' : '';
    const queryParams = new URLSearchParams(query);
    const hashParams = new URLSearchParams(hash);

    const accessToken =
      hashParams.get('access_token') ?? queryParams.get('access_token');
    const refreshToken =
      hashParams.get('refresh_token') ?? queryParams.get('refresh_token');

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

    const code = queryParams.get('code') ?? hashParams.get('code');
    if (!code) {
      return;
    }

    const { data, error } = await supabase.auth.exchangeCodeForSession(url);
    if (error) {
      console.warn('exchangeCodeForSession error', error.message);
      return;
    }
    if (data?.session) {
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

  useEffect(() => {
    if (!session) {
      return;
    }
    flushPendingLegalAcceptance(session);
  }, [session]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isLoading,
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return error ? error.message : null;
      },
      signUp: async (email, password, legalAcceptance) => {
        const { data, error } = await supabase.auth.signUp({ email, password });
        
        // Supabase can return a neutral response without creating a new session.
        if (!error && !data?.session && !data?.user) {
          return {
            error:
              'We could not finish signup automatically. Try signing in or check your email for next steps.',
            needsConfirmation: false,
          };
        }

        if (!error && legalAcceptance && data?.user?.id) {
          try {
            if (data.session?.access_token) {
              await recordLegalAcceptance(data.session.access_token, legalAcceptance);
            } else {
              await cachePendingLegalAcceptance(data.user.id, legalAcceptance);
            }
          } catch (acceptanceError) {
            console.warn('Failed to persist legal acceptance', acceptanceError);
            if (!data.session?.access_token) {
              await cachePendingLegalAcceptance(data.user.id, legalAcceptance);
            }
          }
        }
        
        return {
          error: error ? error.message : null,
          needsConfirmation: !error && !data?.session,
        };
      },
      sendPasswordReset: async (email) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: 'https://verityprotect.com/auth/callback?mode=reset&source=password',
        });
        return error ? error.message : null;
      },
      signInWithGoogle: async () => {
        const redirectTo = 'verityprotect://auth/callback';
        console.log('OAuth redirectTo', redirectTo);
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo },
        });
        if (error) {
          console.warn('signInWithOAuth error', error.message);
          return error.message;
        }
        if (!data?.url) {
          return 'Could not start Google sign in.';
        }
        if (data?.url) {
          console.log('OAuth url', data.url);
          const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
          if (result.type === 'success' && result.url) {
            try {
              await handleOAuthRedirect(result.url);
              const {
                data: { session: latestSession },
              } = await supabase.auth.getSession();
              if (!latestSession) {
                console.warn('[auth][google] callback completed but session is empty');
                return 'Google sign in finished but no session was created.';
              }
            } catch (err) {
              console.warn('OAuth session handling failed', err, {
                redirectTo,
                returnedUrl: result.url,
              });
              return 'Google sign in failed while processing callback.';
            }
          } else {
            console.warn('OAuth session result', result);
            if (result.type === 'cancel') {
              return 'Google sign in was cancelled.';
            }
            return 'Google sign in did not complete.';
          }
        }
        return null;
      },
      signInWithApple: async () => {
        const redirectTo = 'verityprotect://auth/callback';
        console.info('[auth][apple] start', { redirectTo });
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'apple',
          options: {
            redirectTo,
            scopes: 'name email',
          },
        });
        if (error) {
          console.warn('apple signInWithOAuth error', error.message);
          return error.message;
        }
        if (!data?.url) {
          return 'Could not start Apple sign in.';
        }
        if (data?.url) {
          console.info('[auth][apple] oauth url created');
          const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
          console.info('[auth][apple] browser result', { type: result.type });
          if (result.type === 'success' && result.url) {
            try {
              console.info('[auth][apple] callback received', { url: result.url });
              await handleOAuthRedirect(result.url);
              const {
                data: { session: latestSession },
              } = await supabase.auth.getSession();
              if (!latestSession) {
                console.warn('[auth][apple] callback completed but session is empty');
                return 'Apple sign in finished but no session was created.';
              }
              console.info('[auth][apple] session established');
            } catch (err) {
              console.warn('Apple OAuth session handling failed', err, {
                redirectTo,
                returnedUrl: result.url,
              });
              return 'Apple sign in failed while processing callback.';
            }
          } else {
            console.warn('Apple OAuth session result', result);
            if (result.type === 'cancel') {
              return 'Apple sign in was cancelled.';
            }
            return 'Apple sign in did not complete.';
          }
        }
        return null;
      },
      signOut: async () => {
        try {
          await supabase.auth.signOut({ scope: 'local' });
        } finally {
          // Force immediate local auth state clear so navigation returns to SignIn
          // even if the auth state listener callback is delayed on device.
          setSession(null);
          setIsLoading(false);
        }
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
