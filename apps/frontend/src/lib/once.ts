/** What's known of one key's value. */
export type Loaded<T> =
  /** Nobody has asked yet, or it's on its way. */
  | { readonly state: 'unknown' }
  | { readonly state: 'here'; readonly value: T }
  /** It came, with nothing in it to show: kept, and never asked for again. */
  | { readonly state: 'none' }
  /** Asking failed (no network, the server away): asked again after `retry`. */
  | { readonly state: 'failed' };

/**
 * Values loaded once per key and kept for the session. `now` says what's known
 * of one, so a view can show it at once; `get` loads it, once however many ask
 * at the same time; `put` keeps one made here, which no load replaces. A load
 * that fails is remembered as failed until `retry`, so views don't ask again
 * and again while the network is away. `subscribe` hears every change.
 */
export interface Once<T> {
  /** What's known of the key's value: the same object until that changes. */
  now(key: string): Loaded<T>;
  /** Loads the key's value unless it's here or on its way, and says what's then known. */
  get(key: string, load: () => Promise<T | null>): Promise<Loaded<T>>;
  put(key: string, value: T): void;
  /** Lets every key that failed be asked for again. */
  retry(): void;
  /** Forgets everything, and drops whatever is still on its way. */
  clear(): void;
  subscribe(listener: () => void): () => void;
}

const UNKNOWN = { state: 'unknown' } as const;
const NONE = { state: 'none' } as const;
const FAILED = { state: 'failed' } as const;

// shortcut: never evicted. A session's media is a few chats' worth.
export function onceEach<T>(): Once<T> {
  let known = new Map<string, Loaded<T>>();
  let pending = new Map<string, Promise<Loaded<T>>>();
  const listeners = new Set<() => void>();
  const changed = () => listeners.forEach((listener) => listener());

  return {
    now: (key) => known.get(key) ?? UNKNOWN,
    get(key, load) {
      const now = known.get(key);
      if (now?.state === 'here' || now?.state === 'none') {
        return Promise.resolve(now);
      }
      const coming = pending.get(key);
      if (coming) return coming;

      const session = known;
      const loading = load()
        .then(
          (value): Loaded<T> =>
            value === null ? NONE : { state: 'here', value },
          (): Loaded<T> => FAILED
        )
        .then((loaded) => {
          // Cleared meanwhile: it belongs to nobody now.
          if (session !== known) return loaded;
          pending.delete(key);
          // Made here meanwhile: that's the one to keep.
          const now = known.get(key);
          if (now?.state === 'here') return now;
          known.set(key, loaded);
          changed();
          return loaded;
        });
      pending.set(key, loading);
      return loading;
    },
    put(key, value) {
      known.set(key, { state: 'here', value });
      changed();
    },
    retry() {
      const failed = [...known].filter(([, loaded]) => loaded === FAILED);
      for (const [key] of failed) known.delete(key);
      if (failed.length > 0) changed();
    },
    clear() {
      known = new Map();
      pending = new Map();
      changed();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
