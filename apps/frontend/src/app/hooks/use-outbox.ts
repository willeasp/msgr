import { useSyncExternalStore } from 'react';
import { outgoing } from '../data/outbox';

/** The page's messages sent and not yet in their history: on their way, not sent, or stored (app/data/outbox.ts). */
export function useOutbox() {
  return useSyncExternalStore(outgoing.subscribe, outgoing.now);
}
