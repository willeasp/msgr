import type { Watching } from '../application/ports.js';

/** In process memory, like the PubSub: one API instance. */
export function createMemoryWatching(): Watching {
  const counts = new Map<string, number>();
  const key = (userId: string, chatId: string) => `${userId} ${chatId}`;

  return {
    watch(userId, chatId) {
      const watcher = key(userId, chatId);
      counts.set(watcher, (counts.get(watcher) ?? 0) + 1);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        const left = (counts.get(watcher) ?? 1) - 1;
        if (left > 0) counts.set(watcher, left);
        else counts.delete(watcher);
      };
    },
    isWatching: (userId, chatId) => counts.has(key(userId, chatId)),
  };
}
