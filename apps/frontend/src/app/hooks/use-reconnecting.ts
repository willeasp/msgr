import { useEffect, useState, useSyncExternalStore } from 'react';
import { untilReconnectingShows } from '../../lib/connection';
import { liveConnection } from '../data/client';

/**
 * Whether the live connection has been down long enough to say so (lib/
 * connection.ts): a blip says nothing. It comes back by itself, and catches
 * up on what was missed meanwhile.
 */
export function useReconnecting(): boolean {
  const downSince = useSyncExternalStore(
    liveConnection.subscribe,
    liveConnection.downSince
  );
  // The outage that has gone on long enough: a later one starts again.
  const [late, setLate] = useState<number | null>(null);
  useEffect(() => {
    if (downSince === null) return;
    const wait = setTimeout(
      () => setLate(downSince),
      untilReconnectingShows(downSince, Date.now())
    );
    return () => clearTimeout(wait);
  }, [downSince]);
  return downSince !== null && late === downSince;
}
