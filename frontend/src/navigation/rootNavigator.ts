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

type ActiveCallParams = RootStackParamList['ActiveCallModal'];

export function navigateToActiveCall(params: ActiveCallParams) {
  if (!rootNavigationRef.isReady()) {
    return;
  }

  // CRITICAL: Block navigation if no valid callSid
  // Active call screen should ONLY show for actual calls with valid IDs
  if (!params.callSid || params.callSid.trim() === '') {
    console.warn('[Navigation] Blocked navigation to active call screen without valid callSid:', params);
    return;
  }

  console.info('[Navigation] Navigating to active call:', {
    callSid: params.callSid,
    fromNumber: params.fromNumber,
    toNumber: params.toNumber,
    status: params.status,
  });

  const current = rootNavigationRef.getCurrentRoute();
  if (current?.name === 'ActiveCallModal') {
    const currentParams = (current.params ?? {}) as ActiveCallParams;
    const isSameCall =
      (params.callSid && currentParams.callSid && params.callSid === currentParams.callSid) ||
      (!params.callSid && !currentParams.callSid);
    if (isSameCall) {
      return;
    }
  }
  rootNavigationRef.navigate('ActiveCallModal', params);
}

export function dismissActiveCall() {
  if (!rootNavigationRef.isReady()) {
    return;
  }
  const current = rootNavigationRef.getCurrentRoute();
  if (current?.name === 'ActiveCallModal') {
    rootNavigationRef.goBack();
  }
}
