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

type SupportBugReport = {
  id: string;
  profile_id: string;
  reporter_user_id: string;
  reporter_role: string;
  topic: string;
  details: string;
  metadata: Record<string, unknown> | null;
  status: 'open' | 'resolved';
  resolution_note: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

const baseSupportPath = (profileId: string) => `/profiles/${profileId}/support`;
const setupSupportPath = '/support/setup';

async function fetchJson(path: string) {
  const data = await authorizedFetch(path);
  return data;
}

export async function fetchSupportMessages(profileId: string, ticketId?: string | null, limit = 200) {
  const query = new URLSearchParams({ limit: String(limit) });
  if (ticketId) {
    query.append('ticketId', ticketId);
  }
  const data = await fetchJson(`${baseSupportPath(profileId)}/messages?${query.toString()}`);
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

export async function markSupportMessagesRead(profileId: string, ticketId?: string | null) {
  const query = ticketId ? `?ticketId=${encodeURIComponent(ticketId)}` : '';
  await authorizedFetch(`${baseSupportPath(profileId)}/messages/mark-read${query}`, {
    method: 'PATCH',
  });
}

export async function fetchSupportUnreadCount(profileId: string) {
  const data = await fetchJson(`${baseSupportPath(profileId)}/messages/unread-count`);
  return (data?.unreadAgentMessages ?? 0) as number;
}

export async function createSupportTicket(profileId: string) {
  const data = await authorizedFetch(`${baseSupportPath(profileId)}/tickets`, {
    method: 'POST',
  });
  return data as { ticketId: string; message: SupportMessage | null };
}

export async function createSupportBugReport(
  profileId: string,
  payload: { topic: string; details: string; metadata?: Record<string, unknown> }
) {
  const data = await authorizedFetch(`${baseSupportPath(profileId)}/bug-reports`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return data?.bugReport as SupportBugReport;
}

export async function fetchSetupSupportMessages(ticketId?: string | null, limit = 200) {
  const query = new URLSearchParams({ limit: String(limit) });
  if (ticketId) {
    query.append('ticketId', ticketId);
  }
  const data = await fetchJson(`${setupSupportPath}/messages?${query.toString()}`);
  return (data?.messages ?? []) as SupportMessage[];
}

export async function createSetupSupportMessage(payload: {
  content: string;
  category?: string;
  metadata?: Record<string, unknown>;
}) {
  const data = await authorizedFetch(`${setupSupportPath}/messages`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return data?.message as SupportMessage;
}

export async function markSetupSupportMessagesRead(ticketId?: string | null) {
  const query = ticketId ? `?ticketId=${encodeURIComponent(ticketId)}` : '';
  await authorizedFetch(`${setupSupportPath}/messages/mark-read${query}`, {
    method: 'PATCH',
  });
}

export async function deleteSupportTicket(profileId: string, ticketId: string) {
  await authorizedFetch(`${baseSupportPath(profileId)}/tickets/${ticketId}`, {
    method: 'DELETE',
  });
}

export type { SupportMessage };

export type SupportTicketSummary = {
  profile_id: string;
  profile_name: string;
  last_message: SupportMessage | null;
  unread_agent_messages: number;
  twilio_virtual_number: string | null;
  last_activity_at: string | null;
  ticket_id: string;
  ticket_subject: string | null;
  ticket_state: string | null;
};

export async function fetchSupportTickets() {
  const data = await authorizedFetch(`/profiles/support/tickets`);
  return (data?.tickets ?? []) as SupportTicketSummary[];
}

export async function fetchSetupSupportTickets() {
  const data = await authorizedFetch(`/support/setup/tickets`);
  return (data?.tickets ?? []) as SupportTicketSummary[];
}

export async function createSetupSupportTicket() {
  const data = await authorizedFetch(`/support/setup/tickets`, {
    method: 'POST',
  });
  return data as { ticketId: string; message: SupportMessage | null };
}

export type { SupportBugReport };
