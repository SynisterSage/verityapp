import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

const MAX_SECURE_STORE_VALUE_SIZE = 2048;

const secureStorage = {
  getItem: async (key: string) => {
    const secureValue = await SecureStore.getItemAsync(key);
    if (secureValue !== null) {
      return secureValue;
    }
    return AsyncStorage.getItem(key);
  },
  setItem: async (key: string, value: string) => {
    if (value.length > MAX_SECURE_STORE_VALUE_SIZE) {
      console.warn(
        'SecureStore value too large, storing session in AsyncStorage for key:',
        key
      );
      await AsyncStorage.setItem(key, value);
      return;
    }
    try {
      await SecureStore.setItemAsync(key, value);
      await AsyncStorage.removeItem(key);
    } catch (error) {
      console.warn('SecureStore write failed, falling back to AsyncStorage', error);
      await AsyncStorage.setItem(key, value);
    }
  },
  removeItem: async (key: string) => {
    try {
      await SecureStore.deleteItemAsync(key);
    } finally {
      await AsyncStorage.removeItem(key);
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
