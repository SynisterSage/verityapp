import { authorizedFetch } from './backend';

type SupportMessage = {
  id: string;
  sender: 'user' | 'agent';
  content: string;
  category: string | null;
  metadata: Record<string, unknown> | null;
  is_read_by_user: boolean;
  is_read_by_agent: boolean;
  created_at: string;
  updated_at: string;
};

const baseSupportPath = (profileId: string) => `/profiles/${profileId}/support`;

async function fetchJson(path: string) {
  const data = await authorizedFetch(path);
  return data;
}

export async function fetchSupportMessages(profileId: string, limit = 200) {
  const data = await fetchJson(`${baseSupportPath(profileId)}/messages?limit=${limit}`);
  return (data?.messages ?? []) as SupportMessage[];
}

export async function createSupportMessage(
  profileId: string,
  payload: { content: string; category?: string; metadata?: Record<string, unknown> }
) {
  const data = await authorizedFetch(`${baseSupportPath(profileId)}/messages`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return data?.message as SupportMessage;
}

export async function markSupportMessagesRead(profileId: string) {
  await authorizedFetch(`${baseSupportPath(profileId)}/messages/mark-read`, {
    method: 'PATCH',
  });
}

export async function fetchSupportUnreadCount(profileId: string) {
  const data = await fetchJson(`${baseSupportPath(profileId)}/messages/unread-count`);
  return (data?.unreadAgentMessages ?? 0) as number;
}

export type { SupportMessage };
