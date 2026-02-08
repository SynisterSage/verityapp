import { createNavigationContainerRef } from '@react-navigation/native';

import type { RootStackParamList } from './types';

export const rootNavigationRef = createNavigationContainerRef<RootStackParamList>();

export function navigateToSupportPortal() {
  if (rootNavigationRef.isReady()) {
    rootNavigationRef.navigate('SupportPortal');
  }
}

export function navigateToSupportModal() {
  if (rootNavigationRef.isReady()) {
    rootNavigationRef.navigate('SupportModal');
  }
}
