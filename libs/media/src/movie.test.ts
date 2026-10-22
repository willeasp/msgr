import { describe, expect, it } from 'vitest';
import { byteLength, getPixel, setPixel, type Bits } from './bits.js';
import {
  decodeMovie,
  frameOf,
  MAX_FRAMES,
  maxCodedLength,
  MOVIE_FPS,
  encodeMovie,
  type Frames,
} from './movie.js';

/** `count` frames of `width`×`height`, each pixel inked when `ink` says. */
function frames(
  width: number,
  height: number,
  count: number,
  ink: (x: number, y: number, frame: number) => boolean
): Frames {
  const size = byteLength(width, height);
  const movie: Frames = {
    width,
    height,
    count,
    bytes: new Uint8Array(size * count),
  };
  for (let f = 0; f < count; f++) {
    const frame = frameOf(movie, f);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) setPixel(frame, x, y, ink(x, y, f));
  }
  return movie;
}

// A cheap, repeatable scatter.
const noise = (x: number, y: number, f: number) =>
  ((x * 7919 + y * 104729 + f * 1299709) ^ (x * y)) % 3 === 0;

const pixels = (bits: Bits) =>
  Array.from({ length: bits.height }, (_, y) =>
    Array.from({ length: bits.width }, (_, x) =>
      getPixel(bits, x, y) ? '#' : '.'
    ).join('')
  );

describe('a movie', () => {
  it('plays 8 frames a second, for at most 6 seconds', () => {
    expect(MOVIE_FPS).toBe(8);
    expect(MAX_FRAMES).toBe(48);
  });

  it('lends each frame as a picture of its own', () => {
    const movie = frames(10, 3, 2, (x, _y, f) => x === f);
    expect(pixels(frameOf(movie, 0))).toEqual([
      '#.........',
      '#.........',
      '#.........',
    ]);
    expect(pixels(frameOf(movie, 1))).toEqual([
      '.#........',
      '.#........',
      '.#........',
    ]);
  });
});

describe('coding a movie', () => {
  it('decodes to exactly the frames it was given, at any size', () => {
    for (const [width, height, count] of [
      [1, 1, 1],
      [13, 7, 3],
      [64, 40, 12],
    ] as const) {
      const movie = frames(width, height, count, noise);
      const coded = encodeMovie(movie);
      expect(decodeMovie(coded, width, height, count)).toEqual(movie);
    }
  });

  it('codes the same frames to the same bytes', () => {
    const movie = frames(32, 24, 4, noise);
    expect(encodeMovie(movie)).toEqual(encodeMovie(movie));
  });

  it('spends next to nothing on what stays still', () => {
    const still = frames(64, 48, 24, (x, y) => noise(x, y, 0));
    const moving = frames(64, 48, 24, noise);
    const once = encodeMovie({
      ...still,
      count: 1,
      bytes: frameOf(still, 0).bytes,
    }).length;
    // Each frame after the first costs a small share of it, once learned.
    const after = (encodeMovie(still).length - once) / 23;
    expect(after).toBeLessThan(once / 5);
    expect(encodeMovie(moving).length).toBeGreaterThan(once * 10);
  });

  it('never codes more than maxCodedLength, noise or not', () => {
    let seed = 2463534242;
    const random = () => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return (seed >>> 0) / 2 ** 32;
    };
    for (const [width, height, count] of [
      [1, 1, 1],
      [8, 8, 48],
      [33, 17, 48],
      [96, 96, 48],
      [160, 90, 48],
    ] as const) {
      const movie = frames(width, height, count, () => random() < 0.5);
      expect(encodeMovie(movie).length).toBeLessThanOrEqual(
        maxCodedLength(width, height, count)
      );
    }
  });

  it('decodes any bytes at all to frames of the size asked for', () => {
    for (const junk of [
      new Uint8Array(0),
      Uint8Array.from([255, 0, 7]),
      new Uint8Array(500).fill(0xa5),
    ]) {
      const movie = decodeMovie(junk, 21, 5, 3);
      expect(movie).toMatchObject({ width: 21, height: 5, count: 3 });
      expect(movie.bytes.length).toBe(byteLength(21, 5) * 3);
    }
  });
});
