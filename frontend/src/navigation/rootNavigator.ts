import { createNavigationContainerRef } from '@react-navigation/native';

import type { RootStackParamList } from './types';
import type { SupportResourceType } from '../data/resourceSections';

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

type SupportResourceParams = {
  resource: SupportResourceType;
  title?: string;
};

export function navigateToSupportModal(params?: SupportModalParams) {
  if (rootNavigationRef.isReady()) {
    rootNavigationRef.navigate('SupportModal', params ?? {});
  }
}

export function navigateToSupportResource(params: SupportResourceParams) {
  if (rootNavigationRef.isReady()) {
    rootNavigationRef.navigate('SupportResource', params);
  }
}
