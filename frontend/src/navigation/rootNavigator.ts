import { createNavigationContainerRef } from '@react-navigation/native';

import type { RootStackParamList } from './types';

export const rootNavigationRef = createNavigationContainerRef<RootStackParamList>();

export function navigateToSupportPortal() {
  if (rootNavigationRef.isReady()) {
    rootNavigationRef.navigate('SupportPortal');
  }
}

type SupportModalParams = {
  ticketId?: string | null;
  profileId?: string;
  newTicket?: boolean;
  autoEnd?: boolean;
};

export function navigateToSupportModal(params?: SupportModalParams) {
  if (rootNavigationRef.isReady()) {
    rootNavigationRef.navigate('SupportModal', params ?? {});
  }
}
