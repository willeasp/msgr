import { blank, getPixel, setPixel, type Bits } from './bits.js';

// Atkinson's neighbours, right and below; each gets 1/8 of the error.
const SPREAD = [
  [1, 0],
  [2, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
  [0, 2],
] as const;

/**
 * Atkinson's dithering, as in MacPaint: ink below half, 6/8 of the error passed
 * on, so highlights and shadows stay clean. `light` runs row by row, 0 for
 * black to 1 for white.
 */
export function atkinson(
  light: ArrayLike<number>,
  width: number,
  height: number
): Bits {
  const v = Float32Array.from({ length: width * height }, (_, i) =>
    i < light.length ? light[i] ?? 1 : 1
  );
  const bits = blank(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const old = v[y * width + x] ?? 1;
      const ink = old < 0.5;
      if (ink) setPixel(bits, x, y, true);
      const error = (old - (ink ? 0 : 1)) / 8;
      for (const [dx, dy] of SPREAD) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < width && ny < height) {
          v[ny * width + nx] = (v[ny * width + nx] ?? 1) + error;
        }
      }
    }
  }
  return bits;
}

/**
 * Atkinson's dithering for a movie's frames, one after another, `width` by
 * `height`. A pixel whose light has moved less than `hold` since it was last
 * decided keeps its ink or paper, so what stands still doesn't shimmer; its
 * error spreads all the same. `strength` is the share of Atkinson's error
 * passed on: below 1, fewer dots and bolder, flatter shapes.
 */
export function steadyAtkinson(
  width: number,
  height: number,
  { hold = 0.13, strength = 0.6 }: { hold?: number; strength?: number } = {}
): (light: ArrayLike<number>) => Bits {
  // The light each pixel was last decided at, and what it was decided.
  const decided = new Float32Array(width * height);
  let previous: Bits | null = null;
  return (light) => {
    const v = Float32Array.from({ length: width * height }, (_, i) =>
      i < light.length ? light[i] ?? 1 : 1
    );
    const bits = blank(width, height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        // Kept steady pixels can push the error far; bound it.
        const old = Math.min(1.5, Math.max(-0.5, v[i] ?? 1));
        let ink: boolean;
        if (previous && Math.abs((light[i] ?? 1) - (decided[i] ?? 1)) < hold) {
          ink = getPixel(previous, x, y);
        } else {
          ink = old < 0.5;
          decided[i] = light[i] ?? 1;
        }
        if (ink) setPixel(bits, x, y, true);
        const error = (strength * (old - (ink ? 0 : 1))) / 8;
        for (const [dx, dy] of SPREAD) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < width && ny < height) {
            v[ny * width + nx] = (v[ny * width + nx] ?? 1) + error;
          }
        }
      }
    }
    previous = bits;
    return bits;
  };
}
