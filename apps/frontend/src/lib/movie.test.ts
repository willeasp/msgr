import { blank, frameOf, getPixel, setPixel } from '@msgr/bitmap';
import { describe, expect, it } from 'vitest';
import { drawnOver, frameAt, frameShown, movieFromGrey } from './movie';

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

  it('copes with a clip of one flat colour', () => {
    const movie = movieFromGrey(new Uint8Array(12).fill(128), 4, 3, 1);
    expect(movie.bytes.length).toBe(3);
  });
});

describe('a drawing over a movie', () => {
  const movie = () => {
    const frames = { width: 9, height: 1, count: 2, bytes: new Uint8Array(4) };
    // Frame 0 all paper; frame 1 all ink.
    for (let x = 0; x < 9; x++) setPixel(frameOf(frames, 1), x, 0, true);
    return frames;
  };
  const drawing = () => {
    const ink = blank(9, 1);
    const mask = blank(9, 1);
    // Ink drawn at 0, paper drawn at 8, nothing drawn between.
    setPixel(ink, 0, 0, true);
    setPixel(mask, 0, 0, true);
    setPixel(mask, 8, 0, true);
    return { ink, mask };
  };
  const row = (bits: { width: number }, f: (x: number) => boolean) =>
    Array.from({ length: bits.width }, (_, x) => (f(x) ? '#' : '.')).join('');

  it('shows over every frame what was drawn, and the frame elsewhere', () => {
    const shown0 = frameShown(movie(), 0, drawing());
    const shown1 = frameShown(movie(), 1, drawing());
    expect(row(shown0, (x) => getPixel(shown0, x, 0))).toBe('#........');
    expect(row(shown1, (x) => getPixel(shown1, x, 0))).toBe('########.');
  });

  it('is drawn into every frame for sending, leaving the movie as it was', () => {
    const original = movie();
    const drawn = drawnOver(original, drawing());
    const f0 = frameOf(drawn, 0);
    const f1 = frameOf(drawn, 1);
    expect(row(f0, (x) => getPixel(f0, x, 0))).toBe('#........');
    expect(row(f1, (x) => getPixel(f1, x, 0))).toBe('########.');
    expect(getPixel(frameOf(original, 1), 8, 0)).toBe(true);
  });
});

describe('frameAt', () => {
  it('steps 8 frames a second and loops', () => {
    expect(frameAt(0, 3)).toBe(0);
    expect(frameAt(124, 3)).toBe(0);
    expect(frameAt(125, 3)).toBe(1);
    expect(frameAt(375, 3)).toBe(0);
  });
});
