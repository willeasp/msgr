import type { CSSProperties } from 'react';
import {
  SIZE,
  drawnEmoji,
  isBlankBitmap,
  pixelEmoji,
  splitEmoji,
  type Sample,
} from '../../lib/emoji';
import { pixelPath, type Bitmap } from '../../lib/pixels';
import styles from './PixelText.module.css';

const FONT =
  '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
const CANVAS = 96;

/**
 * This device's emoji, drawn big and shrunk to SIZE×SIZE; null without a
 * canvas, or when its font draws the emoji as separate pictures side by side.
 */
function sample(emoji: string): Sample[] | null {
  const big = document.createElement('canvas');
  big.width = big.height = CANVAS;
  const draw = big.getContext('2d');
  const small = document.createElement('canvas');
  small.width = small.height = SIZE;
  const shrink = small.getContext('2d', { willReadFrequently: true });
  if (!draw || !shrink) return null;
  draw.font = `${CANVAS * 0.85}px ${FONT}`;
  draw.textAlign = 'center';
  draw.textBaseline = 'middle';
  // A sequence the font can't join comes out too wide to be one picture.
  if (draw.measureText(emoji).width > CANVAS) return null;
  draw.fillText(emoji, CANVAS / 2, CANVAS * 0.55);
  shrink.imageSmoothingQuality = 'high';
  shrink.drawImage(big, 0, 0, SIZE, SIZE);
  const { data } = shrink.getImageData(0, 0, SIZE, SIZE);
  return Array.from({ length: SIZE * SIZE }, (_, i) => {
    const alpha = (data[i * 4 + 3] ?? 0) / 255;
    const colour =
      (0.299 * (data[i * 4] ?? 0) +
        0.587 * (data[i * 4 + 1] ?? 0) +
        0.114 * (data[i * 4 + 2] ?? 0)) /
      255;
    return { alpha, luminance: colour * alpha + (1 - alpha) }; // over white
  });
}

const maskOf = (bitmap: Bitmap) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${bitmap.length} ${
      bitmap.length
    }" shape-rendering="crispEdges"><path d="${pixelPath(bitmap)}"/></svg>`
  )}")`;

// Each emoji's mask, made once a page; null where this device can't draw it.
const masks = new Map<string, string | null>();
function maskFor(emoji: string): string | null {
  const known = masks.get(emoji);
  if (known !== undefined) return known;
  const samples = drawnEmoji(emoji) ? null : sample(emoji);
  const bitmap = drawnEmoji(emoji) ?? (samples && pixelEmoji(samples));
  const mask = bitmap && !isBlankBitmap(bitmap) ? maskOf(bitmap) : null;
  masks.set(emoji, mask);
  return mask;
}

/** Text with each emoji as 1-bit pixel art in the text's colour; the characters stay, for copying and screen readers. */
export function PixelText({
  text,
  size = 16,
}: {
  text: string;
  size?: 16 | 32;
}) {
  const pieces = splitEmoji(text);
  if (pieces.every((piece) => 'text' in piece)) return text;
  return pieces.map((piece, i) => {
    if ('text' in piece) return piece.text;
    const mask = maskFor(piece.emoji);
    if (!mask) return piece.emoji;
    return (
      <span
        key={i}
        className={size === 32 ? styles.big : styles.emoji}
        style={{ '--emoji': mask } as CSSProperties}
      >
        <span className={styles.char}>{piece.emoji}</span>
      </span>
    );
  });
}
