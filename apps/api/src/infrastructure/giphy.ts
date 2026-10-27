import type { Giphy, GiphyFile } from '../application/ports.js';
import { unavailable } from '../domain/errors.js';
import { GIF_PAGE, GiphyMedia, readGiphyPage } from '../domain/gif.js';
import { err, ok } from '../domain/result.js';

/*
 * Asks GIPHY's API for GIFs and fetches their files from GIPHY's media hosts,
 * on behalf of whoever is signed in: their browser talks to this server
 * alone. The key is GIPHY_API_KEY, and never logged, nor any address with
 * it. A file is fetched only from GIPHY's media hosts, every redirect
 * included, only of the kinds a still or a movie is, and only up to a size.
 */

export interface GiphyOptions {
  readonly apiKey: string;
  /** GIPHY's API for GIFs; tests point it at their own server. */
  readonly api?: string;
  /** How files and answers are fetched; tests pass their own. */
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
  readonly fileTimeoutMs?: number;
}

/** GIFs as rated for teenagers and up, as messaging apps commonly ask. */
const RATING = 'pg-13';
/** A wide GIF's MP4, 200 pixels tall and many seconds long, is rarely 2 MB. */
export const MAX_FILE_BYTES = 8 * 1024 * 1024;
const FILE_TYPES = new Set([
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
]);
const MAX_REDIRECTS = 2;

export function createGiphy({
  apiKey,
  api = 'https://api.giphy.com/v1/gifs',
  fetch: get = fetch,
  timeoutMs = 5000,
  fileTimeoutMs = 20_000,
}: GiphyOptions): Giphy {
  const down = err(unavailable('GIPHY', false));
  return {
    async search(words, offset) {
      const url = new URL(`${api}/${words ? 'search' : 'trending'}`);
      url.search = new URLSearchParams({
        api_key: apiKey,
        limit: String(GIF_PAGE),
        offset: String(offset),
        rating: RATING,
        ...(words && { q: words }),
      }).toString();
      let response: Response;
      try {
        response = await get(url, {
          headers: { accept: 'application/json' },
          redirect: 'error',
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        return down;
      }
      if (response.status === 429) {
        await response.body?.cancel();
        return err(unavailable('GIPHY', true));
      }
      if (response.status === 401 || response.status === 403) {
        console.error(
          'GIPHY refused GIPHY_API_KEY: is it the key GIPHY’s dashboard shows?'
        );
      }
      if (!response.ok) {
        await response.body?.cancel();
        return down;
      }
      try {
        const page = readGiphyPage(await response.json());
        return page ? ok(page) : down;
      } catch {
        return down;
      }
    },

    async file(url) {
      let at = url;
      for (let hops = 0; ; hops++) {
        let response: Response;
        try {
          response = await get(at, {
            redirect: 'manual',
            signal: AbortSignal.timeout(fileTimeoutMs),
          });
        } catch {
          return null;
        }
        const location = response.headers.get('location');
        if (response.status >= 300 && response.status < 400 && location) {
          await response.body?.cancel();
          const next = GiphyMedia.parse(resolve(location, at));
          if (!next || hops >= MAX_REDIRECTS) return null;
          at = next;
          continue;
        }
        const type = (response.headers.get('content-type') ?? '')
          .split(';')[0]
          ?.trim()
          .toLowerCase();
        const length = Number(response.headers.get('content-length') ?? NaN);
        if (
          response.status !== 200 ||
          !response.body ||
          !type ||
          !FILE_TYPES.has(type) ||
          length > MAX_FILE_BYTES
        ) {
          await response.body?.cancel();
          return null;
        }
        return {
          type,
          length: Number.isInteger(length) ? length : null,
          body: upTo(response.body, MAX_FILE_BYTES),
        } satisfies GiphyFile;
      }
    },
  };
}

const resolve = (location: string, base: string) => {
  try {
    return new URL(location, base).href;
  } catch {
    return '';
  }
};

/** The bytes as they come, failing past `max`; stopping early lets go of the rest. */
async function* upTo(
  body: ReadableStream<Uint8Array>,
  max: number
): AsyncGenerator<Uint8Array> {
  const reader = body.getReader();
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      size += value.byteLength;
      if (size > max) throw new Error('GIPHY sent more than it said');
      yield value;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}
