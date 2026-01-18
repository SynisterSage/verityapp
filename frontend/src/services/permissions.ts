import AsyncStorage from '@react-native-async-storage/async-storage';

const CONTACTS_PERMISSION_KEY = 'permissions:contacts-enabled';
const DEFAULT_CONTACTS_PERMISSION = true;

let contactPermissionCache: boolean | null = null;
const listeners = new Set<(enabled: boolean) => void>();

async function loadContactsPermission(): Promise<boolean> {
  if (contactPermissionCache !== null) {
    return contactPermissionCache;
  }
  try {
    const raw = await AsyncStorage.getItem(CONTACTS_PERMISSION_KEY);
    if (raw === null) {
      contactPermissionCache = DEFAULT_CONTACTS_PERMISSION;
    } else {
      const parsed = JSON.parse(raw);
      contactPermissionCache =
        typeof parsed === 'boolean' ? parsed : DEFAULT_CONTACTS_PERMISSION;
    }
  } catch (err) {
    contactPermissionCache = DEFAULT_CONTACTS_PERMISSION;
  }
  return contactPermissionCache;
}

function notifyListeners() {
  const value = contactPermissionCache ?? DEFAULT_CONTACTS_PERMISSION;
  listeners.forEach((listener) => listener(value));
}

export async function getContactsPermissionEnabled(): Promise<boolean> {
  return loadContactsPermission();
}

export async function setContactsPermissionEnabled(enabled: boolean): Promise<void> {
  contactPermissionCache = enabled;
  try {
    await AsyncStorage.setItem(CONTACTS_PERMISSION_KEY, JSON.stringify(enabled));
  } catch {
    // ignore storage failures but keep cache updated
  }
  notifyListeners();
}

export function subscribeToContactsPermissionChange(
  listener: (enabled: boolean) => void
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
