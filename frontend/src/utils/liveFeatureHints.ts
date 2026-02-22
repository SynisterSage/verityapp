import AsyncStorage from '@react-native-async-storage/async-storage';

const CALL_DETAIL_LIVE_NUDGE_DISMISSED_KEY = 'live_features.call_detail_nudge_dismissed';

export async function hasDismissedCallDetailLiveNudge() {
  const value = await AsyncStorage.getItem(CALL_DETAIL_LIVE_NUDGE_DISMISSED_KEY);
  return value === 'true';
}

export async function dismissCallDetailLiveNudge() {
  await AsyncStorage.setItem(CALL_DETAIL_LIVE_NUDGE_DISMISSED_KEY, 'true');
}
