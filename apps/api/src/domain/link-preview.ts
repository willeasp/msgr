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

// Pages are parsed with plain scans, never patterns that can backtrack: a
// hostile page must not stall the server. Only a page's head matters.
const HEAD_BYTES = 64 * 1024;
const MAX_TAG = 4096;
// Attribute names start after whitespace, a quote or a slash, so a long run of
// letters is read once rather than from every position.
const ATTRIBUTE = /(?<=[\s"'/])([a-z:-]{1,64})\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** The part of a page worth reading: up to </head>, at most HEAD_BYTES. */
function headOf(html: string): {
  readonly html: string;
  readonly lower: string;
} {
  const start = html.slice(0, HEAD_BYTES);
  const lower = start.toLowerCase();
  const end = lower.indexOf('</head');
  return end < 0
    ? { html: start, lower }
    : { html: start.slice(0, end), lower: lower.slice(0, end) };
}

/** Each <meta> tag's content by its property or name, the first one winning. */
function metaTags({
  html,
  lower,
}: ReturnType<typeof headOf>): Map<string, string> {
  const tags = new Map<string, string>();
  for (
    let at = lower.indexOf('<meta');
    at >= 0;
    at = lower.indexOf('<meta', at + 1)
  ) {
    const close = lower.indexOf('>', at);
    if (close < 0) break;
    if (close - at > MAX_TAG) continue;
    const attributes = new Map<string, string>();
    for (const [, name = '', double, single] of html
      .slice(at, close)
      .matchAll(ATTRIBUTE)) {
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

/** The text of the first <title>, if it closes. */
function titleOf({ html, lower }: ReturnType<typeof headOf>): string {
  const open = lower.indexOf('<title');
  const start = open < 0 ? -1 : lower.indexOf('>', open);
  const end = start < 0 ? -1 : lower.indexOf('</title', start);
  return end < 0
    ? ''
    : html.slice(start + 1, Math.min(end, start + 1 + MAX_TAG));
}

/** A character by its code, or a replacement mark for a code that isn't one. */
const character = (code: number) =>
  Number.isInteger(code) &&
  code >= 0 &&
  code <= 0x10ffff &&
  (code < 0xd800 || code > 0xdfff)
    ? String.fromCodePoint(code)
    : '\uFFFD';

function decode(text: string): string {
  return text
    .replace(/&#x([0-9a-f]{1,8});/gi, (_, hex: string) =>
      character(parseInt(hex, 16))
    )
    .replace(/&#(\d{1,10});/g, (_, digits: string) => character(Number(digits)))
    .replace(
      /&([a-z]{1,10});/gi,
      (entity, name: string) => NAMED[name.toLowerCase()] ?? entity
    )
    .replace(/\s+/g, ' ')
    .trim();
}

const cut = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

/** A page's title, site, description and picture from its HTML; null without a title. */
export function readPreview(html: string, page: Url): PagePreview | null {
  const head = headOf(html);
  const tags = metaTags(head);
  const text = (key: string) => {
    const value = tags.get(key);
    return value === undefined ? '' : decode(value);
  };
  const title = text('og:title') || decode(titleOf(head));
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
