import {
  decodeMovie,
  encodeMovie,
  frameOf,
  fromBase64,
  setPixel,
  toBase64,
  type Frames,
} from '@msgr/bitmap';
import { describe, expect, it } from 'vitest';
import { fromWire, movieFrames, toWire } from './movie-wire';

const movie = (): Frames => {
  const frames = { width: 13, height: 7, count: 3, bytes: new Uint8Array(42) };
  for (let f = 0; f < 3; f++) setPixel(frameOf(frames, f), f, 6, true);
  return frames;
};

describe('movies on the wire', () => {
  it('codes the frames as the server reads them', () => {
    const wire = toWire(movie());
    expect(wire).toMatchObject({ width: 13, height: 7, frames: 3 });
    expect(
      decodeMovie(fromBase64(wire.bits) ?? new Uint8Array(), 13, 7, 3)
    ).toEqual(movie());
  });

  it('round-trips', () => {
    expect(fromWire(toWire(movie()))).toEqual(movie());
  });

  it('refuses a movie of an impossible size or with bits that are not base64', () => {
    const { bits } = toWire(movie());
    for (const wire of [
      { width: 0, height: 7, frames: 3, bits },
      { width: 13, height: 7, frames: 0, bits },
      { width: 13, height: 7, frames: 49, bits },
      { width: 13, height: 7, frames: 3, bits: 'not base64!' },
    ]) {
      expect(fromWire(wire)).toBeNull();
    }
  });

  it('decodes each movie once, telling apart equal bytes of different shapes', () => {
    const bits = toBase64(
      encodeMovie({ width: 8, height: 2, count: 1, bytes: Uint8Array.of(1, 2) })
    );
    const wide = { width: 8, height: 2, frames: 1, bits };
    const tall = { width: 2, height: 8, frames: 1, bits };
    expect(movieFrames(wide)).toMatchObject({ width: 8, height: 2 });
    expect(movieFrames(tall)).toMatchObject({ width: 2, height: 8 });
    expect(movieFrames(wide)).toBe(movieFrames({ ...wide }));
  });
});
