import type { Bits, Frames, SoundCodes } from '@msgr/media';
import {
  fromBytes as movieFromBytes,
  type KeptMovie,
} from '../../lib/movie-wire';
import { onceEach, type Loaded } from '../../lib/once';
import {
  fromBytes as pictureFromBytes,
  type KeptPicture,
} from '../../lib/picture-wire';
import {
  fromBytes as soundFromBytes,
  type KeptSound,
} from '../../lib/sound-wire';

/*
 * Pictures, movies and sounds, fetched from their addresses (ADR 0012) and
 * decoded once a session, each where it's first shown. The browser keeps the
 * bytes too, so a later visit reads them from disk. What the viewer just
 * sent is kept as they made it, and never fetched back.
 */

/**
 * The bytes at a media address. Throws unless they're the server's own (not a
 * failure, nor a page in their place), so asking again later may succeed.
 */
async function bytesAt(url: string): Promise<Uint8Array<ArrayBuffer>> {
  const response = await fetch(url);
  const type = response.headers.get('Content-Type') ?? '';
  if (!response.ok || !type.startsWith('application/octet-stream')) {
    throw new Error(`No media at ${url}: ${response.status} ${type}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

/** One kind of media, kept by address: an address names its bytes and their shape for good. */
export interface Media<Kept extends { readonly url: string }, T> {
  /** What's known of it now: one already here shows at once. */
  now(kept: Kept): Loaded<T>;
  /** Fetched and decoded once; null if it can't be. Shared between callers: copy before changing it. */
  at(kept: Kept): Promise<T | null>;
  /** What the viewer just sent, as they made it: their own message never downloads. */
  keep(kept: Kept, value: T): void;
  subscribe(listener: () => void): () => void;
}

const kinds: { retry(): void; clear(): void }[] = [];

function media<Kept extends { readonly url: string }, T>(
  decode: (
    kept: Kept,
    bytes: Uint8Array<ArrayBuffer>
  ) => T | null | Promise<T | null>,
  /** Whether a value is the one the server describes, so it may stand for it. */
  fits: (kept: Kept, value: T) => boolean
): Media<Kept, T> {
  const store = onceEach<T>();
  kinds.push(store);
  return {
    now: (kept) => store.now(kept.url),
    async at(kept) {
      const loaded = await store.get(kept.url, async () => {
        const bytes = await bytesAt(kept.url);
        try {
          return await decode(kept, bytes);
        } catch {
          return null; // Bytes that don't decode never will.
        }
      });
      return loaded.state === 'here' ? loaded.value : null;
    },
    keep(kept, value) {
      if (fits(kept, value)) store.put(kept.url, value);
    },
    subscribe: store.subscribe,
  };
}

export const pictures = media<KeptPicture, Bits>(
  pictureFromBytes,
  (kept, bits) => bits.width === kept.width && bits.height === kept.height
);

export const movies = media<KeptMovie, Frames>(
  movieFromBytes,
  (kept, frames) =>
    frames.width === kept.width &&
    frames.height === kept.height &&
    frames.count === kept.frames
);

export const sounds = media<KeptSound, SoundCodes>(
  soundFromBytes,
  (kept, codes) => codes.frames === kept.frames
);

/** Asks again for whatever failed: the network is back, or the page is. */
export function retryMedia(): void {
  for (const kind of kinds) kind.retry();
}

/** Forgets every picture, movie and sound: someone else may be signing in. */
export function forgetMedia(): void {
  for (const kind of kinds) kind.clear();
}
