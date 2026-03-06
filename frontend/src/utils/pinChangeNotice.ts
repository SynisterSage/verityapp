import AsyncStorage from '@react-native-async-storage/async-storage';

const PIN_CHANGE_NOTICE_KEY_PREFIX = 'pinChangeNoticeSeen';

function seenKey(profileId: string, userId: string) {
  return `${PIN_CHANGE_NOTICE_KEY_PREFIX}:${profileId}:${userId}`;
}

export async function getSeenPinChangeAlertId(profileId: string, userId: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(seenKey(profileId, userId));
  } catch {
    return null;
  }
}

export async function markPinChangeAlertSeen(
  profileId: string,
  userId: string,
  alertId: string
): Promise<void> {
  if (!alertId) {
    return;
  }
  try {
    await AsyncStorage.setItem(seenKey(profileId, userId), alertId);
  } catch {
    // Ignore local storage failures; UX fallback is safe.
  }
}
