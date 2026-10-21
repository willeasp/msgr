import { byteLength, type Bits } from './bits.js';
import { adaptiveOdds, rangeDecoder, rangeEncoder } from './range-coder.js';

/** Every movie plays at this many frames a second, looping. */
export const MOVIE_FPS = 8;

/** The most frames a movie may have: six seconds. */
export const MAX_FRAMES = 6 * MOVIE_FPS;

/**
 * A 1-bit movie's frames, each in the `Bits` layout, one after another. The
 * one layout used by the paint window, the wire and the database alike.
 */
export interface Frames {
  readonly width: number;
  readonly height: number;
  readonly count: number;
  readonly bytes: Uint8Array<ArrayBuffer>;
}

/**
 * The most bytes `encodeMovie` makes of `count` frames this size: noise
 * costs a bit a pixel and a little more while each context learns its odds,
 * which in a short movie is a larger share. Comfortably above the worst
 * honest movie, so a server can refuse more before decoding anything.
 */
export const maxCodedLength = (width: number, height: number, count: number) =>
  Math.ceil(byteLength(width, height) * count * 1.125) + 16384;

/** Frame `index` as a picture of its own, sharing the movie's bytes. */
export function frameOf(movie: Frames, index: number): Bits {
  const size = byteLength(movie.width, movie.height);
  return {
    width: movie.width,
    height: movie.height,
    bytes: movie.bytes.subarray(index * size, (index + 1) * size),
  };
}

/*
 * A movie is coded pixel by pixel, in reading order, frame after frame, with
 * the binary range coder. Each pixel's odds come from its context: 11
 * pixels of its own frame already coded, above and to the left, and 5 around
 * it in the frame before. What stands still is foretold by the frame before
 * and costs next to nothing; ink beside ink is foretold by its neighbours.
 */

/** Each context halves its counts past this, to follow the movie as it changes. */
const COUNT_LIMIT = 1023;
const model = () => adaptiveOdds(1 << 16, COUNT_LIMIT);

/**
 * Two frames' pixels, one byte each, with margins of blank paper so every
 * context reads inside: 3 columns on the left, 2 on the right, 2 rows above
 * and 1 below.
 */
function canvases(width: number, height: number) {
  const stride = width + 5;
  const area = stride * (height + 3);
  return {
    stride,
    at: (x: number, y: number) => (y + 2) * stride + x + 3,
    current: new Uint8Array(area),
    previous: new Uint8Array(area),
  };
}

function context(
  current: Uint8Array,
  previous: Uint8Array,
  i: number,
  stride: number
): number {
  const up = i - stride;
  const up2 = i - 2 * stride;
  return (
    current[i - 1] |
    (current[i - 2] << 1) |
    (current[i - 3] << 2) |
    (current[up - 2] << 3) |
    (current[up - 1] << 4) |
    (current[up] << 5) |
    (current[up + 1] << 6) |
    (current[up + 2] << 7) |
    (current[up2 - 1] << 8) |
    (current[up2] << 9) |
    (current[up2 + 1] << 10) |
    (previous[i] << 11) |
    (previous[i - 1] << 12) |
    (previous[i + 1] << 13) |
    (previous[i - stride] << 14) |
    (previous[i + stride] << 15)
  );
}

/** The movie's frames, coded; the bits past each row's right edge are ignored. */
export function encodeMovie(movie: Frames): Uint8Array<ArrayBuffer> {
  const { width, height, count } = movie;
  const rowBytes = Math.ceil(width / 8);
  const size = rowBytes * height;
  const odds = model();
  const page = canvases(width, height);
  const coder = rangeEncoder();
  for (let f = 0; f < count; f++) {
    const base = f * size;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = page.at(x, y);
        const bit =
          (movie.bytes[base + y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1;
        const c = context(page.current, page.previous, i, page.stride);
        coder.code(odds, c, bit);
        page.current[i] = bit;
      }
    }
    [page.previous, page.current] = [page.current, page.previous];
    page.current.fill(0);
  }
  return coder.finish();
}

/**
 * Exactly `count` frames of `width`×`height`, whatever the bytes: past their
 * end they read as zeros, so the work is bounded by the size asked for.
 */
export function decodeMovie(
  coded: Uint8Array,
  width: number,
  height: number,
  count: number
): Frames {
  const rowBytes = Math.ceil(width / 8);
  const size = rowBytes * height;
  const bytes = new Uint8Array(size * count);
  const odds = model();
  const page = canvases(width, height);
  const coder = rangeDecoder(coded);
  for (let f = 0; f < count; f++) {
    const base = f * size;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = page.at(x, y);
        const c = context(page.current, page.previous, i, page.stride);
        const bit = coder.code(odds, c);
        page.current[i] = bit;
        if (bit) bytes[base + y * rowBytes + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
    [page.previous, page.current] = [page.current, page.previous];
    page.current.fill(0);
  }
  return { width, height, count, bytes };
}
