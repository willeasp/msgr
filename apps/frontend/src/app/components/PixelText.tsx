import type { CSSProperties } from 'react';
import {
  drawnEmoji,
  isBlankBitmap,
  pixelEmoji,
  splitEmoji,
} from '../../lib/emoji';
import { sampleEmoji } from '../browser/emoji-font';
import { svgMask } from '../../lib/pixels';
import styles from './PixelText.module.css';

// Each emoji's mask, made once a page; null where this device can't draw it.
const masks = new Map<string, string | null>();
function maskFor(emoji: string): string | null {
  const known = masks.get(emoji);
  if (known !== undefined) return known;
  const samples = drawnEmoji(emoji) ? null : sampleEmoji(emoji);
  const bitmap = drawnEmoji(emoji) ?? (samples && pixelEmoji(samples));
  const mask = bitmap && !isBlankBitmap(bitmap) ? svgMask(bitmap) : null;
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
