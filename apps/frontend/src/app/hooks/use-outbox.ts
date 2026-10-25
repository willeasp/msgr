import { useSyncExternalStore } from 'react';
import { outgoing } from '../data/outbox';

/** The page's messages on their way or not sent (app/data/outbox.ts). */
export function useOutbox() {
  return useSyncExternalStore(outgoing.subscribe, outgoing.now);
}
