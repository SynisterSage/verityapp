export type CallUpdatePayload = {
  callId: string;
};

const listeners = new Set<(payload: CallUpdatePayload) => void>();

export function emitCallUpdated(payload: CallUpdatePayload) {
  listeners.forEach((listener) => listener(payload));
}

export function subscribeToCallUpdates(listener: (payload: CallUpdatePayload) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
