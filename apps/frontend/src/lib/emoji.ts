import { atkinson, getPixel } from '@msgr/bitmap';
import { EMOJI_ART } from './emoji-art';
import type { Bitmap } from './pixels';

/**
 * Dithered emoji are SIZE×SIZE and drawn 16 px tall: one screen pixel per
 * pixel on a high-density display. Hand-drawn ones are ART_SIZE, chunkier.
 */
export const SIZE = 32;
export const ART_SIZE = 16;
export type Piece = { readonly text: string } | { readonly emoji: string };
/** One pixel of an emoji shrunk to SIZE×SIZE: alpha 0–1, luminance 0 (black) to 1 over white. */
export interface Sample {
  readonly alpha: number;
  readonly luminance: number;
}

// Firefox before 125 has no Segmenter: there, emoji stay ordinary characters.
const graphemes =
  'Segmenter' in Intl
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null;
// Shown as emoji by default, or asked to be (U+FE0F), or a keycap.
const EMOJI = /\p{Emoji_Presentation}|\p{Extended_Pictographic}️|⃣/u;

export const isEmoji = (grapheme: string): boolean => EMOJI.test(grapheme);

export function splitEmoji(text: string): Piece[] {
  if (!graphemes) return text ? [{ text }] : [];
  const pieces: Piece[] = [];
  let run = '';
  for (const { segment } of graphemes.segment(text)) {
    if (!isEmoji(segment)) {
      run += segment;
      continue;
    }
    if (run) pieces.push({ text: run });
    run = '';
    pieces.push({ emoji: segment });
  }
  if (run) pieces.push({ text: run });
  return pieces;
}

export function isOnlyEmoji(text: string): boolean {
  const pieces = splitEmoji(text.replace(/\s+/g, ''));
  return (
    pieces.length >= 1 &&
    pieces.length <= 3 &&
    pieces.every((piece) => 'emoji' in piece)
  );
}

/** The pixel art for an emoji: its dithered fill, its outline and its colour edges. */
export function pixelEmoji(samples: readonly Sample[]): Bitmap {
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < SIZE && y < SIZE;
  const inside = (x: number, y: number) =>
    on(x, y) && (samples[y * SIZE + x]?.alpha ?? 0) > 0.4;
  const light = (x: number, y: number) =>
    on(x, y) ? samples[y * SIZE + x]?.luminance ?? 1 : 1;
  const fill = atkinson(
    samples.map(({ luminance }) =>
      Math.min(1, Math.max(0, (luminance - 0.2) / 0.6))
    ),
    SIZE,
    SIZE
  );
  return Array.from({ length: SIZE }, (_, y) =>
    Array.from({ length: SIZE }, (_, x) => {
      if (!inside(x, y)) return '.';
      const outline =
        !inside(x + 1, y) ||
        !inside(x - 1, y) ||
        !inside(x, y + 1) ||
        !inside(x, y - 1);
      const edge =
        Math.abs(light(x, y) - light(x + 1, y)) > 0.3 ||
        Math.abs(light(x, y) - light(x, y + 1)) > 0.3;
      return getPixel(fill, x, y) || outline || edge ? '#' : '.';
    }).join('')
  );
}

export const isBlankBitmap = (bitmap: Bitmap): boolean =>
  bitmap.every((row) => !row.includes('#'));

const plain = (emoji: string) => emoji.replaceAll('️', '');
const DRAWN = new Map(
  Object.entries(EMOJI_ART).map(([emoji, art]) => [plain(emoji), art])
);
/** A hand-drawn replacement, if someone made one; the variation selector doesn't matter. */
export const drawnEmoji = (emoji: string): Bitmap | undefined =>
  DRAWN.get(plain(emoji));
