import type { Clock, LinkPreviewer } from '../application/ports.js';
import type { LinkPreview } from '../domain/link-preview.js';
import type { Url } from '../domain/link.js';

const HOUR = 60 * 60 * 1000;
const KEPT = 24 * HOUR;
const FAILURE_KEPT = HOUR;

/**
 * Remembers previews in memory: a day each, a failed link an hour, at most
 * `maxEntries` links, forgetting the oldest first. Requests for a link already
 * being fetched share that fetch. Memory is wiped whenever the app sleeps, so
 * links are fetched again after it wakes.
 */
export function cachedLinkPreviewer(
  inner: LinkPreviewer,
  clock: Clock,
  { maxEntries = 500 }: { readonly maxEntries?: number } = {}
): LinkPreviewer {
  const entries = new Map<
    Url,
    { readonly at: number; readonly result: Promise<LinkPreview | null> }
  >();

  return {
    async preview(url) {
      const now = clock().getTime();
      const entry = entries.get(url);
      if (entry) {
        const result = await entry.result;
        if (now - entry.at < (result ? KEPT : FAILURE_KEPT)) return result;
        entries.delete(url);
      }
      const result = inner.preview(url);
      entries.set(url, { at: now, result });
      for (const oldest of entries.keys()) {
        if (entries.size <= maxEntries) break;
        entries.delete(oldest);
      }
      return result;
    },
  };
}
