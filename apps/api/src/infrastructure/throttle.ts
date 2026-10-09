import type { Clock, Throttle } from '../application/ports.js';

/** Past this many keys, expired windows are swept so memory stays bounded. */
const SWEEP_ABOVE = 10_000;

/**
 * Fixed windows per key, in this process's memory: enough for msgr, which
 * runs as one instance (see `createPubSubMessageEvents`).
 */
export function createMemoryThrottle({
  limit,
  windowMs,
  clock,
}: {
  readonly limit: number;
  readonly windowMs: number;
  readonly clock: Clock;
}): Throttle {
  const windows = new Map<string, { start: number; count: number }>();

  return {
    attempt(key) {
      const now = clock().getTime();
      if (windows.size > SWEEP_ABOVE) {
        for (const [k, window] of windows) {
          if (now - window.start >= windowMs) windows.delete(k);
        }
      }

      const window = windows.get(key);
      if (!window || now - window.start >= windowMs) {
        windows.set(key, { start: now, count: 1 });
        return true;
      }
      window.count += 1;
      return window.count <= limit;
    },
  };
}
