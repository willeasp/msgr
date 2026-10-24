import {
  decodeMovie,
  encodeMovie,
  frameOf,
  fromBase64,
  setPixel,
  type Frames,
} from '@msgr/media';
import { describe, expect, it } from 'vitest';
import { fromBytes, toWire } from './movie-wire';

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

  it('reads back the bytes the server keeps', () => {
    const size = { width: 13, height: 7, frames: 3 };
    expect(fromBytes(size, encodeMovie(movie()))).toEqual(movie());
  });

  it('refuses a movie of an impossible size', () => {
    const coded = encodeMovie(movie());
    for (const size of [
      { width: 0, height: 7, frames: 3 },
      { width: 13, height: 7, frames: 0 },
      { width: 13, height: 7, frames: 49 },
    ]) {
      expect(fromBytes(size, coded)).toBeNull();
    }
  });
});
