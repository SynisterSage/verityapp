const MANUAL_HANGUP_TTL_MS = 30_000;

const manualHangupAtByCallSid = new Map<string, number>();

function normalizeCallSid(value?: string | null) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed.length > 0 ? trimmed : '';
}

export function markManualHangupIntent(callSid?: string | null) {
  const normalized = normalizeCallSid(callSid);
  if (!normalized) {
    return;
  }
  manualHangupAtByCallSid.set(normalized, Date.now());
}

export function consumeManualHangupIntent(callSid?: string | null) {
  const normalized = normalizeCallSid(callSid);
  if (!normalized) {
    return false;
  }
  const markedAt = manualHangupAtByCallSid.get(normalized);
  manualHangupAtByCallSid.delete(normalized);
  if (!markedAt) {
    return false;
  }
  return Date.now() - markedAt <= MANUAL_HANGUP_TTL_MS;
}
