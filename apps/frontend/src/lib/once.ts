/**
 * Values loaded once per key and kept for the session. `now` reads one that's
 * already here, so a view can show it at once; `get` loads it, once however
 * many ask at the same time; `put` keeps one made here. A load that fails is
 * forgotten, so the next `get` tries again; one that answers null is kept.
 */
export interface Once<T> {
  /** The value, if it's here; undefined if it isn't yet. */
  now(key: string): T | null | undefined;
  /** The value, loaded by `load` if nobody has yet. */
  get(key: string, load: () => Promise<T | null>): Promise<T | null>;
  put(key: string, value: T): void;
}

// shortcut: never evicted. A session's media is a few chats' worth.
export function onceEach<T>(): Once<T> {
  const done = new Map<string, T | null>();
  const pending = new Map<string, Promise<T | null>>();
  return {
    now: (key) => done.get(key),
    get(key, load) {
      if (done.has(key)) return Promise.resolve(done.get(key) ?? null);
      let loading = pending.get(key);
      if (!loading) {
        loading = load().then(
          (value) => {
            done.set(key, value);
            pending.delete(key);
            return value;
          },
          () => {
            pending.delete(key);
            return null;
          }
        );
        pending.set(key, loading);
      }
      return loading;
    },
    put(key, value) {
      done.set(key, value);
    },
  };
}
