import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

const secureStoreOptions: SecureStore.SecureStoreOptions = {
  // Allows background reads after first device unlock, which prevents transient
  // keychain access failures from dropping the auth session when app resumes.
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

const secureStoreCache = new Map<string, string | null>();

const secureStorage = {
  getItem: async (key: string) => {
    try {
      const value = await SecureStore.getItemAsync(key, secureStoreOptions);
      secureStoreCache.set(key, value);
      return value;
    } catch (error) {
      console.error('SecureStore getItem failed', error);
      // Keychain can fail briefly while app state is changing; fall back to
      // last in-memory value to avoid accidental logout.
      return secureStoreCache.get(key) ?? null;
    }
  },
  setItem: async (key: string, value: string) => {
    try {
      await SecureStore.setItemAsync(key, value, secureStoreOptions);
      secureStoreCache.set(key, value);
    } catch (error) {
      console.error('SecureStore setItem failed', error);
      secureStoreCache.set(key, value);
    }
  },
  removeItem: async (key: string) => {
    try {
      await SecureStore.deleteItemAsync(key, secureStoreOptions);
      secureStoreCache.delete(key);
    } catch (error) {
      console.error('SecureStore removeItem failed', error);
      secureStoreCache.delete(key);
    }
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
