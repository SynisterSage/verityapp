type IncomingCallMetadata = {
  callerName: string | null;
  fromNumber: string | null;
  receivedAtEpochMs: number;
};

const metadataByCallSid = new Map<string, IncomingCallMetadata>();
const ENTRY_TTL_MS = 15 * 60 * 1000;

function trimString(input?: string | null) {
  if (!input) return null;
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function pruneExpired() {
  const now = Date.now();
  for (const [callSid, metadata] of metadataByCallSid.entries()) {
    if (now - metadata.receivedAtEpochMs > ENTRY_TTL_MS) {
      metadataByCallSid.delete(callSid);
    }
  }
}

export function rememberIncomingCallMetadata(args: {
  callSid?: string | null;
  callerName?: string | null;
  fromNumber?: string | null;
}) {
  pruneExpired();
  const callSid = trimString(args.callSid);
  if (!callSid) {
    return;
  }
  metadataByCallSid.set(callSid, {
    callerName: trimString(args.callerName),
    fromNumber: trimString(args.fromNumber),
    receivedAtEpochMs: Date.now(),
  });
}

export function getIncomingCallMetadata(callSid?: string | null) {
  pruneExpired();
  const normalized = trimString(callSid);
  if (!normalized) {
    return null;
  }
  return metadataByCallSid.get(normalized) ?? null;
}

export function clearIncomingCallMetadata(callSid?: string | null) {
  const normalized = trimString(callSid);
  if (!normalized) {
    return;
  }
  metadataByCallSid.delete(normalized);
}
