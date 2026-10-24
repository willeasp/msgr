import { useEffect, useSyncExternalStore } from 'react';
import type { Loaded } from '../../lib/once';
import { retryMedia, type Media } from '../data/media';

const NOTHING: Loaded<never> = { state: 'none' };

/**
 * A picture's, movie's or sound's value once fetched and decoded; null until
 * then, for none, or for one that can't be shown. One already here shows at
 * once; others are fetched once `near` (the screen, say), and one that failed
 * shows as soon as asking again works (`useMediaRetry`), with nothing to
 * remount.
 */
export function useMedia<Kept extends { readonly url: string }, T>(
  kind: Media<Kept, T>,
  kept: Kept | null | undefined,
  near = true
): T | null {
  const loaded = useSyncExternalStore(kind.subscribe, () =>
    kept ? kind.now(kept) : NOTHING
  );
  useEffect(() => {
    if (kept && near && loaded.state === 'unknown') void kind.at(kept);
  }, [kind, kept, near, loaded]);
  return loaded.state === 'here' ? loaded.value : null;
}

/**
 * Asks again for media that failed whenever there may be a reason it now
 * works: the network is back, or the page is (a phone wakes).
 */
export function useMediaRetry() {
  useEffect(() => {
    const visible = () => {
      if (document.visibilityState === 'visible') retryMedia();
    };
    window.addEventListener('online', retryMedia);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.removeEventListener('online', retryMedia);
      document.removeEventListener('visibilitychange', visible);
    };
  }, []);
}
