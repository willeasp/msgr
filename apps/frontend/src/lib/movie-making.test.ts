import { frameOf, getPixel } from '@msgr/media';
import { describe, expect, it } from 'vitest';
import { movieFromGrey } from './movie-making';

describe('movieFromGrey', () => {
  it('dithers each frame, inking the dark and leaving the light', () => {
    // 8×2, two frames: dark on the left, light on the right.
    const grey = Uint8Array.from({ length: 2 * 16 }, (_, i) =>
      i % 8 < 4 ? 10 : 245
    );
    const movie = movieFromGrey(grey, 8, 2, 2);
    expect(movie).toMatchObject({ width: 8, height: 2, count: 2 });
    for (const f of [0, 1]) {
      expect(getPixel(frameOf(movie, f), 1, 0)).toBe(true);
      expect(getPixel(frameOf(movie, f), 6, 1)).toBe(false);
    }
  });

  it('holds still what stands still, frame after frame', () => {
    const one = Array.from({ length: 32 * 24 }, (_, i) => (i * 37) % 256);
    const grey = Uint8Array.from([...one, ...one, ...one]);
    const movie = movieFromGrey(grey, 32, 24, 3);
    expect(frameOf(movie, 1).bytes).toEqual(frameOf(movie, 0).bytes);
    expect(frameOf(movie, 2).bytes).toEqual(frameOf(movie, 0).bytes);
  });

  it('stretches a dim clip to black and white', () => {
    // Nothing darker than mid grey or lighter than a bit above it.
    const grey = Uint8Array.from({ length: 16 }, (_, i) => (i < 8 ? 110 : 140));
    const movie = movieFromGrey(grey, 16, 1, 1);
    expect(getPixel(frameOf(movie, 0), 0, 0)).toBe(true);
    expect(getPixel(frameOf(movie, 0), 15, 0)).toBe(false);
  });

  it('leaves a clip of one flat colour that colour, with nothing to stretch', () => {
    const ink = (grey: number) => {
      const movie = movieFromGrey(new Uint8Array(12).fill(grey), 4, 3, 1);
      return [0, 1, 2, 3].map((x) => getPixel(frameOf(movie, 0), x, 1));
    };
    expect(ink(255)).toEqual([false, false, false, false]);
    expect(ink(0)).toEqual([true, true, true, true]);
  });
});
