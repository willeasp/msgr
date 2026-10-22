import { SIZE, type Sample } from '../../lib/emoji';

const FONT =
  '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
const CANVAS = 96;

/**
 * This device's emoji, drawn big and shrunk to SIZE×SIZE; null without a
 * canvas, or when its font draws the emoji as separate pictures side by side.
 */
export function sampleEmoji(emoji: string): Sample[] | null {
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
