/**
 * Shared state for managing VoIP placeholder CallKit calls
 *
 * When a VoIP push arrives, we create a placeholder CallKit call to satisfy iOS requirements.
 * When Twilio's real incoming call arrives, we end the placeholder so user only sees one call.
 */

let placeholderCallUUID: string | null = null;
let autoAcceptNextIncomingUntilMs = 0;

export function setPlaceholderCallUUID(uuid: string): void {
  placeholderCallUUID = uuid;
  autoAcceptNextIncomingUntilMs = 0;
  console.info('[VoIPPlaceholder] Set placeholder call UUID:', uuid);
}

export function getPlaceholderCallUUID(): string | null {
  return placeholderCallUUID;
}

export function clearPlaceholderCallUUID(): void {
  const uuid = placeholderCallUUID;
  placeholderCallUUID = null;
  if (uuid) {
    console.info('[VoIPPlaceholder] Cleared placeholder call UUID:', uuid);
  }
  return;
}

export function markPlaceholderCallAnswered(callUUID: string): void {
  if (!placeholderCallUUID || callUUID !== placeholderCallUUID) {
    return;
  }
  autoAcceptNextIncomingUntilMs = Date.now() + 20_000;
  console.info('[VoIPPlaceholder] Placeholder call answered; will auto-accept next Twilio invite');
}

export function consumeAutoAcceptNextIncomingCall(): boolean {
  if (autoAcceptNextIncomingUntilMs === 0) {
    return false;
  }

  const shouldAutoAccept = Date.now() <= autoAcceptNextIncomingUntilMs;
  autoAcceptNextIncomingUntilMs = 0;
  return shouldAutoAccept;
}
