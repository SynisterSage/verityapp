import { createInterface, Interface } from 'node:readline';
import { format } from 'node:util';

import supabaseAdmin from '@src/services/supabase';
import { ASSISTANT_STATUS_ID } from '@src/constants/assistantStatus';

type SupportMessageRow = {
  id: string;
  profile_id: string;
  sender: 'user' | 'agent';
  content: string;
  metadata: Record<string, unknown> | null;
  is_read_by_user: boolean;
  is_read_by_agent: boolean;
  created_at: string;
  updated_at: string;
};

type SetupSupportMessageRow = {
  id: string;
  user_id: string;
  email_snapshot: string | null;
  sender: 'user' | 'agent';
  content: string;
  metadata: Record<string, unknown> | null;
  is_read_by_user: boolean;
  is_read_by_agent: boolean;
  created_at: string;
  updated_at: string;
};

type TicketScope = 'profile' | 'setup';

type TicketSummary = {
  ref: string;
  scope: TicketScope;
  ticketId: string;
  profileId?: string;
  userId?: string;
  emailSnapshot?: string | null;
  lastMessage: SupportMessageRow | SetupSupportMessageRow;
  unreadAgentCount: number;
  ticketState: string | null;
  subject: string | null;
};

type TicketResolution =
  | {
      scope: 'profile';
      ref: string;
      ticketId: string;
      profileId: string;
      messages: SupportMessageRow[];
    }
  | {
      scope: 'setup';
      ref: string;
      ticketId: string;
      userId: string;
      messages: SetupSupportMessageRow[];
    };

const USAGE = `Available commands:
  list [history]      Show recent tickets across profile + setup support
  view <ticketRef>    Print timeline for a ticket
  reply <ticketRef>   Send an agent reply (typing or passing text after the ref)
  close <ticketRef>   Close a ticket with an optional closing note
  feedback <ticketRef> Show feedback/ratings for a ticket
  status [online|offline|show]  Toggle or display assistant status
  mark-read <ticketRef>         Mark user messages as read by agent
  help                Show this message
  exit | quit         End the session

Ticket refs:
  profile:<profileId>:<ticketId>
  setup:<userId>:<ticketId>
`;

let replInterface: Interface | null = null;
let suppressLine = false;

async function prompt(message: string) {
  if (!replInterface) {
    throw new Error('Repl not ready');
  }
  return new Promise<string>((resolve) => {
    suppressLine = true;
    replInterface?.question(message, (value) => {
      suppressLine = false;
      resolve(value.trim());
    });
  });
}

function getTicketId(metadata?: Record<string, unknown> | null) {
  const id = metadata?.ticketId;
  if (typeof id === 'string' && id.trim().length > 0) {
    return id;
  }
  return null;
}

function getTicketState(metadata?: Record<string, unknown> | null) {
  const state = metadata?.ticketState;
  if (typeof state === 'string') {
    return state;
  }
  return null;
}

function getTicketSubject(metadata?: Record<string, unknown> | null) {
  const subject = metadata?.ticketSubject;
  if (typeof subject === 'string' && subject.trim()) {
    return subject;
  }
  const promptLabel = metadata?.promptLabel;
  if (typeof promptLabel === 'string' && promptLabel.trim()) {
    return promptLabel;
  }
  return null;
}

function buildTicketRef(scope: TicketScope, ownerId: string, ticketId: string) {
  return `${scope}:${ownerId}:${ticketId}`;
}

function parseTicketRef(raw: string) {
  const value = raw.trim();
  const parts = value.split(':');
  if (parts.length >= 3 && (parts[0] === 'profile' || parts[0] === 'setup')) {
    return {
      scope: parts[0] as TicketScope,
      ownerId: parts[1],
      ticketId: parts.slice(2).join(':'),
      legacy: false,
    };
  }
  return {
    scope: null,
    ownerId: null,
    ticketId: value,
    legacy: true,
  };
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    day: 'numeric',
    month: 'short',
  });
}

async function fetchProfileNames(profileIds: string[]) {
  if (profileIds.length === 0) {
    return new Map<string, string>();
  }
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('id, first_name, last_name')
    .in('id', profileIds);
  const map = new Map<string, string>();
  for (const profile of data ?? []) {
    const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.id;
    map.set(profile.id, name);
  }
  return map;
}

async function fetchTicketSummaries(limit = 600): Promise<TicketSummary[]> {
  const profileMap = new Map<string, TicketSummary>();
  const setupMap = new Map<string, TicketSummary>();

  const { data: profileData, error: profileError } = await supabaseAdmin
    .from('support_messages')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (profileError) {
    throw profileError;
  }

  for (const row of (profileData ?? []) as SupportMessageRow[]) {
    const ticketId = getTicketId(row.metadata);
    if (!ticketId) continue;

    const key = buildTicketRef('profile', row.profile_id, ticketId);
    const state = getTicketState(row.metadata);
    const subject = getTicketSubject(row.metadata);
    const existing = profileMap.get(key);

    if (!existing) {
      profileMap.set(key, {
        ref: key,
        scope: 'profile',
        ticketId,
        profileId: row.profile_id,
        lastMessage: row,
        unreadAgentCount: row.sender === 'agent' && !row.is_read_by_user ? 1 : 0,
        ticketState: state,
        subject,
      });
      continue;
    }

    const existingLastTs = Date.parse(existing.lastMessage.created_at);
    const currentTs = Date.parse(row.created_at);
    if (currentTs >= existingLastTs) {
      existing.lastMessage = row;
    }
    if (row.sender === 'agent' && !row.is_read_by_user) {
      existing.unreadAgentCount += 1;
    }
    if (state && !existing.ticketState) {
      existing.ticketState = state;
    }
    if (subject && !existing.subject) {
      existing.subject = subject;
    }
  }

  const { data: setupData, error: setupError } = await supabaseAdmin
    .from('support_setup_messages')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (setupError) {
    throw setupError;
  }

  for (const row of (setupData ?? []) as SetupSupportMessageRow[]) {
    const ticketId = getTicketId(row.metadata) ?? 'setup-help';
    const key = buildTicketRef('setup', row.user_id, ticketId);
    const state = getTicketState(row.metadata);
    const subject = getTicketSubject(row.metadata);
    const existing = setupMap.get(key);

    if (!existing) {
      setupMap.set(key, {
        ref: key,
        scope: 'setup',
        ticketId,
        userId: row.user_id,
        emailSnapshot: row.email_snapshot,
        lastMessage: row,
        unreadAgentCount: row.sender === 'agent' && !row.is_read_by_user ? 1 : 0,
        ticketState: state,
        subject,
      });
      continue;
    }

    const existingLastTs = Date.parse(existing.lastMessage.created_at);
    const currentTs = Date.parse(row.created_at);
    if (currentTs >= existingLastTs) {
      existing.lastMessage = row;
    }
    if (row.sender === 'agent' && !row.is_read_by_user) {
      existing.unreadAgentCount += 1;
    }
    if (state && !existing.ticketState) {
      existing.ticketState = state;
    }
    if (subject && !existing.subject) {
      existing.subject = subject;
    }
    if (!existing.emailSnapshot && row.email_snapshot) {
      existing.emailSnapshot = row.email_snapshot;
    }
  }

  const summaries = [...Array.from(profileMap.values()), ...Array.from(setupMap.values())];
  summaries.sort((a, b) => Date.parse(b.lastMessage.created_at) - Date.parse(a.lastMessage.created_at));
  return summaries;
}

async function resolveTicket(input: string): Promise<TicketResolution | null> {
  const parsed = parseTicketRef(input);

  if (!parsed.legacy && parsed.scope === 'profile' && parsed.ownerId) {
    const { data, error } = await supabaseAdmin
      .from('support_messages')
      .select('*')
      .eq('profile_id', parsed.ownerId)
      .eq('metadata->>ticketId', parsed.ticketId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    const messages = (data ?? []) as SupportMessageRow[];
    if (messages.length === 0) return null;
    return {
      scope: 'profile',
      ref: buildTicketRef('profile', parsed.ownerId, parsed.ticketId),
      ticketId: parsed.ticketId,
      profileId: parsed.ownerId,
      messages,
    };
  }

  if (!parsed.legacy && parsed.scope === 'setup' && parsed.ownerId) {
    const { data, error } = await supabaseAdmin
      .from('support_setup_messages')
      .select('*')
      .eq('user_id', parsed.ownerId)
      .eq('metadata->>ticketId', parsed.ticketId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    const messages = (data ?? []) as SetupSupportMessageRow[];
    if (messages.length === 0) return null;
    return {
      scope: 'setup',
      ref: buildTicketRef('setup', parsed.ownerId, parsed.ticketId),
      ticketId: parsed.ticketId,
      userId: parsed.ownerId,
      messages,
    };
  }

  const [profileRows, setupRows] = await Promise.all([
    supabaseAdmin
      .from('support_messages')
      .select('*')
      .eq('metadata->>ticketId', parsed.ticketId)
      .order('created_at', { ascending: true }),
    supabaseAdmin
      .from('support_setup_messages')
      .select('*')
      .eq('metadata->>ticketId', parsed.ticketId)
      .order('created_at', { ascending: true }),
  ]);

  if (profileRows.error) throw profileRows.error;
  if (setupRows.error) throw setupRows.error;

  const profileMessages = (profileRows.data ?? []) as SupportMessageRow[];
  const setupMessages = (setupRows.data ?? []) as SetupSupportMessageRow[];

  const profileOwners = Array.from(new Set(profileMessages.map((row) => row.profile_id)));
  const setupOwners = Array.from(new Set(setupMessages.map((row) => row.user_id)));
  const matchCount = profileOwners.length + setupOwners.length;

  if (matchCount === 0) return null;
  if (matchCount > 1) {
    console.log(
      `Ticket id "${parsed.ticketId}" is ambiguous. Use profile:<profileId>:${parsed.ticketId} or setup:<userId>:${parsed.ticketId}.`
    );
    return null;
  }

  if (profileOwners.length === 1) {
    const ownerId = profileOwners[0];
    return {
      scope: 'profile',
      ref: buildTicketRef('profile', ownerId, parsed.ticketId),
      ticketId: parsed.ticketId,
      profileId: ownerId,
      messages: profileMessages,
    };
  }

  const ownerId = setupOwners[0];
  return {
    scope: 'setup',
    ref: buildTicketRef('setup', ownerId, parsed.ticketId),
    ticketId: parsed.ticketId,
    userId: ownerId,
    messages: setupMessages,
  };
}

async function listTickets(showHistory = false) {
  const summaries = await fetchTicketSummaries();
  if (summaries.length === 0) {
    console.log('No tickets found.');
    return;
  }

  const profileIds = Array.from(
    new Set(summaries.map((summary) => summary.profileId).filter((value): value is string => Boolean(value)))
  );
  const profileNames = await fetchProfileNames(profileIds);

  console.log('Tickets:');
  const table = summaries.map((summary) => ({
    Ref: summary.ref,
    Scope: summary.scope,
    Owner:
      summary.scope === 'profile'
        ? profileNames.get(summary.profileId ?? '') ?? summary.profileId ?? '—'
        : summary.emailSnapshot ?? summary.userId ?? '—',
    Subject: summary.subject ?? '—',
    State: summary.ticketState ?? 'open',
    'Last Update': formatDate(summary.lastMessage.created_at),
    Unread: summary.unreadAgentCount,
  }));
  console.table(table);

  if (!showHistory) return;

  for (const summary of summaries) {
    console.log(`\nTicket ${summary.ref} history (${summary.ticketState ?? 'open'}):`);
    const result = await resolveTicket(summary.ref);
    const messages = result?.messages ?? [];
    if (messages.length === 0) {
      console.log('  (no messages yet)');
      continue;
    }
    for (const message of messages) {
      const prefix = message.sender === 'agent' ? 'A' : 'U';
      const tag = message.sender === 'agent' ? 'AGENT' : 'USER';
      const time = formatDate(message.created_at);
      const content = message.content.replace(/\s+/g, ' ').trim();
      console.log(`  [${prefix}] ${time} ${tag}: ${content}`);
    }
  }
}

async function viewTicket(ticketRef: string) {
  const result = await resolveTicket(ticketRef);
  if (!result) {
    console.log(`No ticket found for ${ticketRef}`);
    return;
  }
  console.log(`Ticket ${result.ref} — ${result.messages.length} messages`);
  for (const msg of result.messages) {
    console.log(format('%s [%s] %s', formatDate(msg.created_at), msg.sender.toUpperCase(), msg.content));
  }
}

async function sendReply(ticketRef: string, message: string) {
  const result = await resolveTicket(ticketRef);
  if (!result) {
    console.log(`Ticket ${ticketRef} not found.`);
    return;
  }

  if (result.scope === 'profile') {
    await supabaseAdmin.from('support_messages').insert({
      profile_id: result.profileId,
      sender: 'agent',
      content: message,
      metadata: { ticketId: result.ticketId, ticketState: 'open' },
    });
  } else {
    await supabaseAdmin.from('support_setup_messages').insert({
      user_id: result.userId,
      email_snapshot: null,
      sender: 'agent',
      content: message,
      metadata: { ticketId: result.ticketId, ticketState: 'open', preProfile: true },
    });
  }

  console.log('Reply sent.');
}

async function closeTicket(ticketRef: string, note?: string) {
  const result = await resolveTicket(ticketRef);
  if (!result) {
    console.log(`Ticket ${ticketRef} not found.`);
    return;
  }

  const metadata: Record<string, unknown> = {
    ticketId: result.ticketId,
    ticketState: 'closed',
    ticketSubject: note ? note : 'Closed by dev console',
  };
  if (result.scope === 'setup') {
    metadata.preProfile = true;
  }

  if (result.scope === 'profile') {
    await supabaseAdmin.from('support_messages').insert({
      profile_id: result.profileId,
      sender: 'agent',
      content: note ?? 'Closing this conversation',
      metadata,
    });
  } else {
    await supabaseAdmin.from('support_setup_messages').insert({
      user_id: result.userId,
      email_snapshot: null,
      sender: 'agent',
      content: note ?? 'Closing this conversation',
      metadata,
    });
  }

  console.log('Ticket closed.');
}

async function showFeedback(ticketRef: string) {
  const result = await resolveTicket(ticketRef);
  if (!result) {
    console.log(`Ticket ${ticketRef} not found.`);
    return;
  }

  const feedback = result.messages.filter((msg) => typeof msg.metadata?.feedbackRating === 'string');
  if (feedback.length === 0) {
    console.log('No feedback recorded for this ticket.');
    return;
  }

  for (const msg of feedback) {
    const rating = msg.metadata?.feedbackRating;
    const note = msg.metadata?.feedbackNote;
    console.log(`${formatDate(msg.created_at)} — Rating: ${rating} — ${note ?? 'no note'}`);
  }
}

async function markTicketRead(ticketRef: string) {
  const result = await resolveTicket(ticketRef);
  if (!result) {
    console.log(`Ticket ${ticketRef} not found.`);
    return;
  }

  if (result.scope === 'profile') {
    await supabaseAdmin
      .from('support_messages')
      .update({ is_read_by_agent: true })
      .eq('profile_id', result.profileId)
      .eq('sender', 'user')
      .eq('metadata->>ticketId', result.ticketId)
      .eq('is_read_by_agent', false);
  } else {
    await supabaseAdmin
      .from('support_setup_messages')
      .update({ is_read_by_agent: true })
      .eq('user_id', result.userId)
      .eq('sender', 'user')
      .eq('metadata->>ticketId', result.ticketId)
      .eq('is_read_by_agent', false);
  }

  console.log('User messages marked as read by agent.');
}

async function getAssistantStatus() {
  const { data } = await supabaseAdmin
    .from('assistant_status')
    .select('id, is_online, updated_at')
    .eq('id', ASSISTANT_STATUS_ID)
    .limit(1)
    .maybeSingle();
  return data;
}

async function setAssistantStatus(isOnline: boolean) {
  await supabaseAdmin.from('assistant_status').upsert({
    id: ASSISTANT_STATUS_ID,
    is_online: isOnline,
    updated_at: new Date().toISOString(),
  });
}

async function showStatus() {
  const status = await getAssistantStatus();
  if (!status) {
    console.log('Assistant status not configured yet. Run: status online');
    return;
  }
  console.log(`Assistant is ${status.is_online ? 'online' : 'offline'} (updated ${status.updated_at})`);
}

async function printHelp() {
  console.log(USAGE);
}

async function repl() {
  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: 'support> ' });
  replInterface = rl;
  await printHelp();
  rl.prompt();

  rl.on('line', async (input) => {
    if (suppressLine) {
      return;
    }
    const trimmed = input.trim();
    if (!trimmed) {
      rl.prompt();
      return;
    }

    const [command, ...args] = trimmed.split(' ');

    try {
      if (command === 'exit' || command === 'quit') {
        rl.close();
        return;
      }

      switch (command) {
        case 'list': {
          const showHistory = args[0] === 'history';
          await listTickets(showHistory);
          break;
        }
        case 'view': {
          const ticketRef = args[0];
          if (!ticketRef) {
            console.log('view requires a ticketRef');
            break;
          }
          await viewTicket(ticketRef);
          break;
        }
        case 'reply': {
          const ticketRef = args[0];
          if (!ticketRef) {
            console.log('reply requires a ticketRef');
            break;
          }
          const message = args.slice(1).join(' ') || (await prompt('Reply content: '));
          if (!message) {
            console.log('Aborted (empty message)');
            break;
          }
          await sendReply(ticketRef, message);
          break;
        }
        case 'close': {
          const ticketRef = args[0];
          if (!ticketRef) {
            console.log('close requires a ticketRef');
            break;
          }
          const note = args.slice(1).join(' ') || (await prompt('Close note (optional): '));
          await closeTicket(ticketRef, note || undefined);
          break;
        }
        case 'feedback': {
          const ticketRef = args[0];
          if (!ticketRef) {
            console.log('feedback requires a ticketRef');
            break;
          }
          await showFeedback(ticketRef);
          break;
        }
        case 'status': {
          const action = args[0] ?? 'show';
          if (action === 'show') {
            await showStatus();
          } else if (action === 'online') {
            await setAssistantStatus(true);
            console.log('Assistant marked online.');
          } else if (action === 'offline') {
            await setAssistantStatus(false);
            console.log('Assistant marked offline.');
          } else {
            console.log('Unknown status command. Expected online/offline/show.');
          }
          break;
        }
        case 'mark-read': {
          const ticketRef = args[0];
          if (!ticketRef) {
            console.log('mark-read requires a ticketRef');
            break;
          }
          await markTicketRead(ticketRef);
          break;
        }
        case 'help':
          await printHelp();
          break;
        default:
          console.log('Unknown command. Type help to see available commands.');
      }
    } catch (error) {
      console.error('Command failed', error);
    }

    rl.prompt();
  });

  rl.on('close', () => {
    supabaseAdmin.auth.signOut().catch(() => void 0);
    process.exit(0);
  });
}

repl().catch((error) => {
  console.error('CLI error', error);
  supabaseAdmin.auth.signOut().catch(() => void 0);
  process.exit(1);
});
