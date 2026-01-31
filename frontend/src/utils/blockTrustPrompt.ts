import AsyncStorage from '@react-native-async-storage/async-storage';

const BLOCK_MANUAL_KEY = 'callDetailAlwaysBlockOnFraud';
const TRUST_MANUAL_KEY = 'callDetailAlwaysTrustOnSafe';

export async function getAutoBlockManual(): Promise<boolean> {
  const value = await AsyncStorage.getItem(BLOCK_MANUAL_KEY);
  return value === 'true';
}

export async function getAutoTrustManual(): Promise<boolean> {
  const value = await AsyncStorage.getItem(TRUST_MANUAL_KEY);
  return value === 'true';
}

export async function setAutoBlockManual(value: boolean): Promise<void> {
  if (value) {
    await AsyncStorage.setItem(BLOCK_MANUAL_KEY, 'true');
  } else {
    await AsyncStorage.removeItem(BLOCK_MANUAL_KEY);
  }
}

export async function setAutoTrustManual(value: boolean): Promise<void> {
  if (value) {
    await AsyncStorage.setItem(TRUST_MANUAL_KEY, 'true');
  } else {
    await AsyncStorage.removeItem(TRUST_MANUAL_KEY);
  }
}
