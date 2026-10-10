import type { Brand } from './brand.js';
import { Url } from './link.js';

/**
 * A page's picture as a 64×64 black-and-white thumbnail: rows top to bottom,
 * 8 pixels a byte with the leftmost in the high bit, 1 for ink, in base64.
 */
export type Thumbnail = Brand<string, 'Thumbnail'>;
export const THUMBNAIL_SIZE = 64;

/** What a page says about itself. */
export interface PagePreview {
  readonly title: string;
  readonly site: string;
  readonly description: string | null;
  readonly image: Url | null;
}

/** The card for a link: what the page says, and its picture dithered. */
export interface LinkPreview {
  readonly url: Url;
  readonly site: string;
  readonly title: string;
  readonly description: string | null;
  readonly thumbnail: Thumbnail | null;
}

const META = /<meta\b[^>]*>/gi;
const ATTRIBUTE = /([a-z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
const TITLE = /<title\b[^>]*>([\s\S]*?)<\/title>/i;
const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** Each <meta> tag's content by its property or name, the first one winning. */
function metaTags(html: string): Map<string, string> {
  const tags = new Map<string, string>();
  for (const [tag] of html.matchAll(META)) {
    const attributes = new Map<string, string>();
    for (const [, name = '', double, single] of tag.matchAll(ATTRIBUTE)) {
      attributes.set(name.toLowerCase(), double ?? single ?? '');
    }
    const key = (
      attributes.get('property') ?? attributes.get('name')
    )?.toLowerCase();
    const content = attributes.get('content');
    if (key && content !== undefined && !tags.has(key)) tags.set(key, content);
  }
  return tags;
}

function decode(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, digits: string) =>
      String.fromCodePoint(Number(digits))
    )
    .replace(
      /&([a-z]+);/gi,
      (entity, name: string) => NAMED[name.toLowerCase()] ?? entity
    )
    .replace(/\s+/g, ' ')
    .trim();
}

const cut = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

/** A page's title, site, description and picture from its HTML; null without a title. */
export function readPreview(html: string, page: Url): PagePreview | null {
  const tags = metaTags(html);
  const text = (key: string) => {
    const value = tags.get(key);
    return value === undefined ? '' : decode(value);
  };
  const title = text('og:title') || decode(TITLE.exec(html)?.[1] ?? '');
  if (!title) return null;
  const description = text('og:description') || text('description');
  const image = tags.get('og:image');
  return {
    title: cut(title, 120),
    site: cut(
      text('og:site_name') || new URL(page).hostname.replace(/^www\./, ''),
      60
    ),
    description: description ? cut(description, 200) : null,
    image: image ? Url.parse(decode(image), page) : null,
  };
}

/** Atkinson's dithering of 64×64 greyscale bytes (0 black, 255 white), packed into bits. */
export function ditherThumbnail(grey: Uint8Array): Thumbnail {
  const size = THUMBNAIL_SIZE;
  const light = Float32Array.from(grey, (value) => value / 255);
  const bytes = new Uint8Array((size * size) / 8);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const old = light[y * size + x] ?? 1;
      const ink = old < 0.5;
      const at = y * (size / 8) + (x >> 3);
      if (ink) bytes[at] = (bytes[at] ?? 0) | (0x80 >> (x & 7));
      const error = (old - (ink ? 0 : 1)) / 8;
      for (const [dx, dy] of [
        [1, 0],
        [2, 0],
        [-1, 1],
        [0, 1],
        [1, 1],
        [0, 2],
      ] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < size && ny < size) {
          const next = ny * size + nx;
          light[next] = (light[next] ?? 1) + error;
        }
      }
    }
  }
  return btoa(String.fromCharCode(...bytes)) as Thumbnail;
}
