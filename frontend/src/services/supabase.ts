import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import LZString from 'lz-string';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

const encodeValue = (value: string) => LZString.compressToUTF16(value);
const decodeValue = (value: string) => {
  const decoded = LZString.decompressFromUTF16(value);
  return decoded ?? value;
};
const MAX_SECURE_STORE_VALUE_SIZE = 2048;

const secureStorage = {
  getItem: async (key: string) => {
    const secureValue = await SecureStore.getItemAsync(key);
    if (secureValue !== null) {
      return decodeValue(secureValue);
    }
    const asyncValue = await AsyncStorage.getItem(key);
    if (asyncValue !== null) {
      return decodeValue(asyncValue);
    }
    return null;
  },
  setItem: async (key: string, value: string) => {
    const payload = encodeValue(value);
    if (payload.length > MAX_SECURE_STORE_VALUE_SIZE) {
      console.warn(
        'Value exceeds SecureStore limit; persisting via AsyncStorage instead',
        key
      );
      await SecureStore.deleteItemAsync(key);
      await AsyncStorage.setItem(key, payload);
      return;
    }
    try {
      await SecureStore.setItemAsync(key, payload);
      await AsyncStorage.removeItem(key);
    } catch (error) {
      console.warn('SecureStore write failed, falling back to AsyncStorage', error);
      await AsyncStorage.setItem(key, payload);
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
