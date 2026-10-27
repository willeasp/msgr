import type { Brand } from './brand.js';
import { invalidInput, type InvalidInput } from './errors.js';
import { err, ok, type Result } from './result.js';

/*
 * GIFs found on GIPHY, to make movies of. This server asks GIPHY and fetches
 * what it finds, so GIPHY never sees who searched for what; the app makes the
 * movie on the device, as it does from a video, and sends it like any other.
 */

/** Words to search GIPHY for: trimmed, spaces run together, 1 to 50 characters. */
export type GifSearch = Brand<string, 'GifSearch'>;
export const GifSearch = {
  /** GIPHY's own limit. */
  MAX_LENGTH: 50,
  /** Null for no words at all, which asks for what's trending instead. */
  parse(raw: string): Result<GifSearch | null, InvalidInput> {
    const words = raw.trim().replace(/\s+/g, ' ');
    if (!words) return ok(null);
    if (words.length > GifSearch.MAX_LENGTH) {
      return err(
        invalidInput(
          'search',
          `Search for at most ${GifSearch.MAX_LENGTH} characters`
        )
      );
    }
    return ok(words as GifSearch);
  },
};

/** Where a page of GIFs starts: how many GIPHY has given before it. */
export type GifOffset = Brand<number, 'GifOffset'>;
export const GifOffset = {
  /** The furthest GIPHY pages. */
  MAX: 4999,
  FIRST: 0 as GifOffset,
  /** A page's cursor, as `GifPage.next` gave it. */
  parse(raw: string): Result<GifOffset, InvalidInput> {
    const offset = /^\d{1,4}$/.test(raw) ? Number(raw) : NaN;
    return offset <= GifOffset.MAX
      ? ok(offset as GifOffset)
      : err(invalidInput('after', 'Not a page of GIFs'));
  },
};

/**
 * An address of GIPHY's own media: https, on one of its media hosts, as
 * GIPHY gave it. This server fetches nothing else for GIFs.
 */
export type GiphyMedia = Brand<string, 'GiphyMedia'>;
const GIPHY_MEDIA_HOST = /^(?:media[0-9]?|i)\.giphy\.com$/;
export const GiphyMedia = {
  MAX_LENGTH: 2048,
  parse(raw: string): GiphyMedia | null {
    if (raw.length > GiphyMedia.MAX_LENGTH) return null;
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return null;
    }
    const plain =
      url.protocol === 'https:' &&
      GIPHY_MEDIA_HOST.test(url.hostname) &&
      !url.port &&
      !url.username &&
      !url.password;
    return plain ? (url.href as GiphyMedia) : null;
  },
};

/**
 * A GIF on GIPHY: what GIPHY calls it, a still of it about 100 pixels on
 * its short side to choose it by, and it as an MP4 200 on its short side,
 * a little more than a movie's 320 on the long one needs.
 */
export interface Gif {
  readonly id: string;
  readonly title: string;
  readonly still: GiphyMedia;
  readonly movie: GiphyMedia;
}

/** One page of GIFs, and where the next starts; null at the last. */
export interface GifPage {
  readonly gifs: readonly Gif[];
  readonly next: GifOffset | null;
}

/** How many GIFs GIPHY is asked for at a time: whole rows of 3 or 4. */
export const GIF_PAGE = 24;

const MAX_TITLE = 200;

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/** GIPHY writes sizes as strings ("200"), and counts as numbers. */
const count = (value: unknown): number | null => {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 ? n : null;
};

const media = (
  images: Record<string, unknown>,
  rendition: string,
  field: 'url' | 'mp4'
): GiphyMedia | null => {
  const url = record(images[rendition])?.[field];
  return typeof url === 'string' ? GiphyMedia.parse(url) : null;
};

/** One of GIPHY's results, or null if it lacks a still or a movie the app can use. */
function readGif(raw: unknown): Gif | null {
  const gif = record(raw);
  const images = record(gif?.['images']);
  const original = record(images?.['original']);
  const id = gif?.['id'];
  if (!gif || !images || typeof id !== 'string' || !/^\w{1,64}$/.test(id)) {
    return null;
  }
  // Each by its short side: a wide GIF's renditions of fixed height, a tall
  // one's of fixed width.
  const width = count(original?.['width']) ?? 1;
  const height = count(original?.['height']) ?? 1;
  const [still, movie] =
    width >= height
      ? [
          media(images, 'fixed_height_small_still', 'url'),
          media(images, 'fixed_height', 'mp4'),
        ]
      : [
          media(images, 'fixed_width_small_still', 'url'),
          media(images, 'fixed_width', 'mp4'),
        ];
  if (!still || !movie) return null;
  const title = typeof gif['title'] === 'string' ? gif['title'].trim() : '';
  return { id, title: title.slice(0, MAX_TITLE), still, movie };
}

/**
 * GIPHY's answer to a search or for what's trending, or null if it isn't
 * one; no page is next past `maxOffset`, the furthest GIPHY pages that list.
 */
export function readGiphyPage(
  json: unknown,
  maxOffset: number = GifOffset.MAX
): GifPage | null {
  const answer = record(json);
  const data = answer?.['data'];
  const pagination = record(answer?.['pagination']);
  if (!Array.isArray(data) || !pagination) return null;
  const offset = count(pagination['offset']) ?? 0;
  const given = count(pagination['count']) ?? data.length;
  const total = count(pagination['total_count']);
  // Paged by what GIPHY gave, though some may be left out here.
  const next = offset + given;
  return {
    gifs: data.map(readGif).filter((gif): gif is Gif => gif !== null),
    next:
      given > 0 && (total === null || next < total) && next <= maxOffset
        ? (next as GifOffset)
        : null,
  };
}
