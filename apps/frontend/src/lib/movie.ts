import {
  blank,
  byteLength,
  frameOf,
  isBlank,
  MOVIE_FPS,
  steadyAtkinson,
  type Bits,
  type Frames,
} from '@msgr/bitmap';

/**
 * A video's frames, `width`×`height` grey bytes each (0 black, 255 white),
 * made a movie on this device: the clip's levels stretched to black and
 * white, its local contrast lifted and its edges sharpened, so faces and
 * shapes survive 1 bit; then dithered by `steadyAtkinson`, so what stands
 * still doesn't shimmer.
 */
export function movieFromGrey(
  grey: Uint8Array,
  width: number,
  height: number,
  count: number
): Frames {
  const making = makeMovie(grey, width, height, count);
  for (;;) {
    const step = making.next();
    if (step.done) return step.value;
  }
}

/**
 * `movieFromGrey` a frame at a time: yields after each, so a page can show
 * progress and stay responsive, and returns the movie.
 */
export function* makeMovie(
  grey: Uint8Array,
  width: number,
  height: number,
  count: number
): Generator<number, Frames> {
  const area = width * height;
  const [lo, hi] = levels(grey.subarray(0, area * count));
  const dither = steadyAtkinson(width, height);
  const size = byteLength(width, height);
  const bytes = new Uint8Array(size * count);
  for (let f = 0; f < count; f++) {
    const light = new Float32Array(area);
    for (let i = 0; i < area; i++) {
      light[i] = clamp((grey[f * area + i] / 255 - lo) / (hi - lo));
    }
    bytes.set(dither(clarify(light, width, height)).bytes, f * size);
    yield f + 1;
  }
  return { width, height, count, bytes };
}

const clamp = (v: number) => Math.min(1, Math.max(0, v));

/** The 2nd and 98th percentiles of the clip's greys, 0 to 1, or 0 and 1 when they're close. */
function levels(grey: Uint8Array): [number, number] {
  const histogram = new Uint32Array(256);
  for (const g of grey) histogram[g]++;
  const at = (share: number) => {
    let seen = 0;
    for (let g = 0; g < 256; g++) {
      seen += histogram[g];
      if (seen >= share * grey.length) return g / 255;
    }
    return 1;
  };
  const [lo, hi] = [at(0.02), at(0.98)];
  // Next to no spread, like a clip of one colour: nothing to stretch.
  return hi - lo < 8 / 255 ? [0, 1] : [lo, hi];
}

/** Local contrast lifted (against a blur 1/20th of the long side), then edges. */
function clarify(light: Float32Array, width: number, height: number) {
  const local = blur(light, width, height, Math.max(width, height) / 20);
  for (let i = 0; i < light.length; i++) {
    light[i] += 0.9 * (light[i] - local[i]);
  }
  const fine = blur(light, width, height, 0.8);
  for (let i = 0; i < light.length; i++) {
    light[i] = clamp(light[i] + 0.7 * (light[i] - fine[i]));
  }
  return light;
}

/** A Gaussian blur, across then down, edges extended. */
function blur(src: Float32Array, width: number, height: number, sigma: number) {
  const r = Math.max(1, Math.ceil(3 * sigma));
  const kernel = Float32Array.from({ length: 2 * r + 1 }, (_, i) =>
    Math.exp(-((i - r) ** 2) / (2 * sigma * sigma))
  );
  const sum = kernel.reduce((a, b) => a + b, 0);
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;
  const across = new Float32Array(src.length);
  const down = new Float32Array(src.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let v = 0;
      for (let k = -r; k <= r; k++) {
        v +=
          kernel[k + r] *
          src[y * width + Math.min(width - 1, Math.max(0, x + k))];
      }
      across[y * width + x] = v;
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let v = 0;
      for (let k = -r; k <= r; k++) {
        v +=
          kernel[k + r] *
          across[Math.min(height - 1, Math.max(0, y + k)) * width + x];
      }
      down[y * width + x] = v;
    }
  }
  return down;
}

/**
 * What's drawn over a movie, the same over every frame: `mask` says where
 * something was drawn and `ink` what, ink or paper.
 */
export interface Drawing {
  readonly ink: Bits;
  readonly mask: Bits;
}

/** Nothing drawn yet, over a movie this size. */
export const noDrawing = (width: number, height: number): Drawing => ({
  ink: blank(width, height),
  mask: blank(width, height),
});

/** Frame `index` as shown: the drawing over it. */
export function frameShown(
  movie: Frames,
  index: number,
  drawing: Drawing | null,
  into: Bits = blank(movie.width, movie.height)
): Bits {
  const frame = frameOf(movie, index).bytes;
  if (!drawing) {
    into.bytes.set(frame);
    return into;
  }
  const { ink, mask } = drawing;
  for (let i = 0; i < frame.length; i++) {
    into.bytes[i] =
      (frame[i] & ~mask.bytes[i]) | (ink.bytes[i] & mask.bytes[i]);
  }
  return into;
}

/** The movie with the drawing in every frame, as it is sent; the movie is kept. */
export function drawnOver(movie: Frames, drawing: Drawing): Frames {
  const bytes = new Uint8Array(movie.bytes.length);
  const size = byteLength(movie.width, movie.height);
  for (let f = 0; f < movie.count; f++) {
    const into = {
      ...frameOf(movie, f),
      bytes: bytes.subarray(f * size, (f + 1) * size),
    };
    frameShown(movie, f, drawing, into);
  }
  return { ...movie, bytes };
}

/** The frame showing `ms` into a movie of `count` frames, looping. */
export const frameAt = (ms: number, count: number) =>
  Math.floor((ms * MOVIE_FPS) / 1000) % count;

/** Whether no frame has any ink: such a movie can't be sent. */
export const isBlankMovie = (movie: Frames) =>
  Array.from({ length: movie.count }, (_, f) => frameOf(movie, f)).every(
    isBlank
  );
