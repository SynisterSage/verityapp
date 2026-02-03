import { supabase } from './supabase';
import { logError, logEvent } from './sentry';

const baseUrl = process.env.EXPO_PUBLIC_API_URL ?? '';

type AuthorizedFetchOptions = RequestInit & {
  skipUnauthorizedSignOut?: boolean;
};

async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? '';
}

export async function authorizedFetch(path: string, options: AuthorizedFetchOptions = {}) {
  const startTime = Date.now();
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (!headers['Content-Type'] && options.body) {
    headers['Content-Type'] = 'application/json';
  }

  const { skipUnauthorizedSignOut, ...rest } = options;
  const url = `${baseUrl}${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      ...rest,
      headers,
    });
  } catch (err) {
    const durationMs = Date.now() - startTime;
    logError(err, {
      screen: 'network',
      extra: {
        reason: 'network_error',
        url,
        method: rest.method ?? 'GET',
        durationMs,
      },
    });
    throw err;
  }

  if (!response.ok) {
    if (response.status === 401 && !skipUnauthorizedSignOut) {
      // Session is invalid (e.g., user deleted) — clear it so the app returns to sign-in.
      await supabase.auth.signOut();
    }
    const text = await response.text();
    let message = text;
    if (text) {
      try {
        const json = JSON.parse(text);
        if (json?.message) {
          message = json.message;
        } else if (Array.isArray(json?.errors) && json.errors[0]?.message) {
          message = json.errors[0].message;
        } else if (json?.error?.message) {
          message = json.error.message;
        } else {
          message = JSON.stringify(json);
        }
      } catch {
        message = text;
      }
    }
    const durationMs = Date.now() - startTime;
    logEvent('api_error', {
      level: response.status >= 500 ? 'error' : 'warning',
      screen: 'network',
      extra: {
        url,
        method: rest.method ?? 'GET',
        status: response.status,
        durationMs,
        message: message || 'Request failed',
      },
    });
    throw new Error(message || 'Request failed');
  }
  const durationMs = Date.now() - startTime;
  if (response.status === 204) {
    if (durationMs > 8000) {
      logEvent('api_timeout', {
        level: 'warning',
        screen: 'network',
        extra: {
          url,
          method: rest.method ?? 'GET',
          durationMs,
        },
      });
    }
    return null;
  }
  if (durationMs > 8000) {
    logEvent('api_timeout', {
      level: 'warning',
      screen: 'network',
      extra: {
        url,
        method: rest.method ?? 'GET',
        durationMs,
      },
    });
  }
  return response.json();
}
