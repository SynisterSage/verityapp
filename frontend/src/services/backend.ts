import { supabase } from './supabase';

const baseUrl = process.env.EXPO_PUBLIC_API_URL ?? '';

async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? '';
}

export async function authorizedFetch(path: string, options: RequestInit = {}) {
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

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    if (response.status === 401) {
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
    throw new Error(message || 'Request failed');
  }
  if (response.status === 204) {
    return null;
  }
  return response.json();
}
