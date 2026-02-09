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

type TicketSummary = {
  ticketId: string;
  profileId: string;
  lastMessage: SupportMessageRow;
  unreadAgentCount: number;
  ticketState: string | null;
  subject: string | null;
};

const USAGE = `Available commands:
  list [history]      Show a summary of recent tickets (add 'history' to dump every ticket's timeline)
  view <ticketId>     Print the timeline for a ticket
  reply <ticketId>    Send an agent reply (typing or passing text after the id)
  close <ticketId>    Close a ticket with an optional closing note
  feedback <ticketId> Show feedback/ratings for a ticket
  status [online|offline|show]  Toggle or display assistant status
  mark-read <ticketId>          Mark the agent’s replies as read for a ticket
  help                Show this message
  exit | quit         End the session
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

async function fetchTicketSummaries(limit = 600): Promise<TicketSummary[]> {
  const { data, error } = await supabaseAdmin
    .from('support_messages')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    throw error;
  }
  const map = new Map<string, TicketSummary>();
  for (const row of data ?? []) {
    const ticketId = getTicketId(row.metadata);
    if (!ticketId) {
      continue;
    }
    const state = getTicketState(row.metadata);
    const subject = getTicketSubject(row.metadata);
    const existing = map.get(ticketId);
    if (!existing) {
      map.set(ticketId, {
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
    if (state) {
      existing.ticketState = state;
    }
    if (subject && !existing.subject) {
      existing.subject = subject;
    }
  }
  const summaries = Array.from(map.values());
  summaries.sort((a, b) => Date.parse(b.lastMessage.created_at) - Date.parse(a.lastMessage.created_at));
  return summaries;
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

function formatDate(value: string) {
  return new Date(value).toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' });
}

async function listTickets(showHistory = false) {
  const summaries = await fetchTicketSummaries();
  const profileIds = Array.from(new Set(summaries.map((summary) => summary.profileId))).filter(Boolean);
  const profileNames = await fetchProfileNames(profileIds);
  if (summaries.length === 0) {
    console.log('No tickets found.');
    return;
  }
  console.log('Tickets:');
  const table = summaries.map((summary) => ({
    Ticket: summary.ticketId,
    Profile: profileNames.get(summary.profileId) ?? summary.profileId,
    Subject: summary.subject ?? '—',
    State: summary.ticketState ?? 'open',
    'Last Update': formatDate(summary.lastMessage.created_at),
    Unread: summary.unreadAgentCount,
  }));
  console.table(table);
  if (!showHistory) {
    return;
  }
  for (const summary of summaries) {
    console.log(`\nTicket ${summary.ticketId} history (${summary.ticketState ?? 'open'}):`);
    const messages = await fetchMessagesForTicket(summary.ticketId);
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

async function fetchMessagesForTicket(ticketId: string) {
  const { data, error } = await supabaseAdmin
    .from('support_messages')
    .select('*')
    .eq('metadata->>ticketId', ticketId)
    .order('created_at', { ascending: true });
  if (error) {
    throw error;
  }
  return (data ?? []) as SupportMessageRow[];
}

async function fetchTicketProfileId(ticketId: string) {
  const messages = await fetchMessagesForTicket(ticketId);
  if (messages.length === 0) {
    return null;
  }
  return { profileId: messages[0].profile_id, messages };
}

async function viewTicket(ticketId: string) {
  const result = await fetchTicketProfileId(ticketId);
  if (!result) {
    console.log(`No ticket found for id ${ticketId}`);
    return;
  }
  const { messages } = result;
  console.log(`Ticket ${ticketId} — ${messages.length} messages`);
  for (const msg of messages) {
    console.log(format('%s [%s] %s', formatDate(msg.created_at), msg.sender.toUpperCase(), msg.content));
  }
}

async function sendReply(ticketId: string, message: string) {
  const result = await fetchTicketProfileId(ticketId);
  if (!result) {
    console.log(`Ticket ${ticketId} not found.`);
    return;
  }
  await supabaseAdmin.from('support_messages').insert({
    profile_id: result.profileId,
    sender: 'agent',
    content: message,
    metadata: { ticketId, ticketState: 'open' },
  });
  console.log('Reply sent.');
}

async function closeTicket(ticketId: string, note?: string) {
  const result = await fetchTicketProfileId(ticketId);
  if (!result) {
    console.log(`Ticket ${ticketId} not found.`);
    return;
  }
  await supabaseAdmin.from('support_messages').insert({
    profile_id: result.profileId,
    sender: 'agent',
    content: note ?? 'Closing this conversation',
    metadata: {
      ticketId,
      ticketState: 'closed',
      ticketSubject: note ? note : 'Closed by dev console',
    },
  });
  console.log('Ticket closed.');
}

async function showFeedback(ticketId: string) {
  const messages = await fetchMessagesForTicket(ticketId);
  const feedback = messages.filter((msg) => typeof msg.metadata?.feedbackRating === 'string');
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

async function markTicketRead(ticketId: string) {
  const result = await fetchTicketProfileId(ticketId);
  if (!result) {
    console.log(`Ticket ${ticketId} not found.`);
    return;
  }
  const { profileId } = result;
  await supabaseAdmin
    .from('support_messages')
    .update({ is_read_by_agent: true })
    .eq('profile_id', profileId)
    .eq('sender', 'user')
    .eq('metadata->>ticketId', ticketId)
    .eq('is_read_by_agent', false);
  console.log('Agent messages marked as read.');
}

async function printHelp() {
  console.log(USAGE);
}

async function repl() {
  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: 'support> ' });
  printHelp();
  rl.prompt();
  rl.on('line', async (input) => {
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
        case 'view':
          if (!args[0]) {
            console.log('view requires a ticketId');
            break;
          }
          await viewTicket(args[0]);
          break;
        case 'reply': {
          const ticketId = args[0];
          if (!ticketId) {
            console.log('reply requires a ticketId');
            break;
          }
          const message = args.slice(1).join(' ') || (await prompt('Reply content: '));
          if (!message) {
            console.log('Aborted (empty message)');
            break;
          }
          await sendReply(ticketId, message);
          break;
        }
        case 'close': {
          const ticketId = args[0];
          if (!ticketId) {
            console.log('close requires a ticketId');
            break;
          }
          const note = args.slice(1).join(' ') || (await prompt('Close note (optional): '));
          await closeTicket(ticketId, note || undefined);
          break;
        }
        case 'feedback': {
          const ticketId = args[0];
          if (!ticketId) {
            console.log('feedback requires a ticketId');
            break;
          }
          await showFeedback(ticketId);
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
          const ticketId = args[0];
          if (!ticketId) {
            console.log('mark-read requires a ticketId');
            break;
          }
          await markTicketRead(ticketId);
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
