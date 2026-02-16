/**
 * Shared state for managing VoIP placeholder CallKit calls
 *
 * When a VoIP push arrives, we create a placeholder CallKit call to satisfy iOS requirements.
 * When Twilio's real incoming call arrives, we end the placeholder so user only sees one call.
 */

let placeholderCallUUID: string | null = null;

export function setPlaceholderCallUUID(uuid: string): void {
  placeholderCallUUID = uuid;
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
