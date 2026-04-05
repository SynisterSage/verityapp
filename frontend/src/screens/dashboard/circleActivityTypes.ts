import type { AlertRow } from './alertTypes';

export type CircleActivityItem = {
  id: string;
  label: string;
  description: string;
  timestamp: string;
  alertRow: AlertRow;
  actorAvatarUrl?: string | null;
};
