import { atkinson, type Bits } from '@msgr/bitmap';

/**
 * A photo's RGBA pixels, row by row, as a 1-bit picture: each pixel's
 * brightness (Rec. 601, see-through parts over white paper) dithered with
 * Atkinson's method, like the emoji.
 */
export function ditherPhoto(
  rgba: ArrayLike<number>,
  width: number,
  height: number
): Bits {
  const light = Float32Array.from({ length: width * height }, (_, i) => {
    const alpha = (rgba[i * 4 + 3] ?? 0) / 255;
    const colour =
      (0.299 * (rgba[i * 4] ?? 0) +
        0.587 * (rgba[i * 4 + 1] ?? 0) +
        0.114 * (rgba[i * 4 + 2] ?? 0)) /
      255;
    return colour * alpha + (1 - alpha);
  });
  return atkinson(light, width, height);
}
