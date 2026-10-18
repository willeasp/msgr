import {
  byteLength,
  decodeMovie,
  encodeMovie,
  frameOf,
  setPixel,
  toBase64,
  type Frames,
} from '@msgr/bitmap';
import { describe, expect, it } from 'vitest';
import { Movie, type RawMovie } from './movie.js';

/** `count` frames, each inked at (frame, 0): a dot walking right. */
const walking = (width: number, height: number, count: number): Frames => {
  const movie = {
    width,
    height,
    count,
    bytes: new Uint8Array(byteLength(width, height) * count),
  };
  for (let f = 0; f < count; f++) setPixel(frameOf(movie, f), f, 0, true);
  return movie;
};
const wire = (movie: Frames): RawMovie => ({
  width: movie.width,
  height: movie.height,
  frames: movie.count,
  bits: toBase64(encodeMovie(movie)),
});
const errorFor = (raw: RawMovie) => {
  const result = Movie.parse(raw);
  return result.ok ? null : result.error.reason;
};

describe('Movie.parse', () => {
  it('accepts a movie of any shape up to 320 a side and 48 frames, and codes it itself', () => {
    const frames = walking(13, 320, 48);
    // Junk after the end decodes to nothing; what's kept is the server's own coding.
    const sent = wire(frames);
    const padded = {
      ...sent,
      bits: toBase64(Uint8Array.from([...encodeMovie(frames), 1, 2, 3])),
    };
    const result = Movie.parse(padded);
    if (!result.ok) throw new Error(result.error.reason);
    expect(result.value).toMatchObject({ width: 13, height: 320, frames: 48 });
    expect(result.value.coded).toEqual(encodeMovie(frames));
    expect(decodeMovie(result.value.coded, 13, 320, 48)).toEqual(frames);
  });

  it('rejects sides outside 1 to 320, before decoding anything', () => {
    for (const [width, height] of [
      [0, 10],
      [321, 10],
      [10, 1.5],
    ] as const) {
      expect(errorFor({ width, height, frames: 1, bits: '' })).toBe(
        'Movie must be 1 to 320 pixels a side'
      );
    }
  });

  it('rejects fewer than 1 frame or more than 48', () => {
    for (const frames of [0, 49, 2.5]) {
      expect(errorFor({ width: 8, height: 8, frames, bits: '' })).toBe(
        'Movie must have 1 to 48 frames'
      );
    }
  });

  it('rejects bits that are not canonical base64', () => {
    const { bits } = wire(walking(8, 1, 1));
    expect(errorFor({ width: 8, height: 1, frames: 1, bits: ` ${bits}` })).toBe(
      'Movie must be base64'
    );
  });

  it('rejects a payload longer than any honest movie, before decoding it', () => {
    expect(
      errorFor({ width: 8, height: 8, frames: 2, bits: 'A'.repeat(100_000) })
    ).toBe('Movie is too large for its size');
  });

  it('rejects a movie with no ink in any frame, ink past the right edge included', () => {
    const blank = { width: 9, height: 2, count: 3, bytes: new Uint8Array(12) };
    expect(errorFor(wire(blank))).toBe('Movie must not be blank');
    const edge = { width: 1, height: 1, count: 1, bytes: Uint8Array.of(0x01) };
    expect(errorFor(wire(edge))).toBe('Movie must not be blank');
  });

  it('names the movie as the field at fault', () => {
    expect(
      Movie.parse({ width: 0, height: 0, frames: 1, bits: '' })
    ).toMatchObject({
      ok: false,
      error: { field: 'movie' },
    });
  });
});
