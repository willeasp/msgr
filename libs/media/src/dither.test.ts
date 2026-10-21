import { describe, expect, it } from 'vitest';
import { getPixel } from './bits.js';
import { atkinson, steadyAtkinson } from './dither.js';

const count = (light: number[], width: number, height: number) => {
  const bits = atkinson(light, width, height);
  let ink = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) if (getPixel(bits, x, y)) ink++;
  return ink;
};

describe("Atkinson's dithering", () => {
  it('inks black, leaves white, at any size', () => {
    expect(count(Array(13 * 7).fill(0), 13, 7)).toBe(13 * 7);
    expect(count(Array(13 * 7).fill(1), 13, 7)).toBe(0);
  });

  it('turns mid grey into a scatter of about half ink', () => {
    const ink = count(Array(64 * 64).fill(0.5), 64, 64) / (64 * 64);
    expect(ink).toBeGreaterThan(0.4);
    expect(ink).toBeLessThan(0.6);
  });

  it('packs its output like any other picture', () => {
    const bits = atkinson([0, 1, 1, 0], 2, 2);
    expect(bits).toMatchObject({ width: 2, height: 2 });
    expect([...bits.bytes]).toEqual([0x80, 0x40]);
  });
});

describe("Atkinson's dithering for a movie", () => {
  const gradient = (width: number, height: number) =>
    Array.from({ length: width * height }, (_, i) => (i % width) / (width - 1));

  it('starts out as plain Atkinson at full strength', () => {
    const light = gradient(32, 8);
    expect(steadyAtkinson(32, 8, { strength: 1 })(light)).toEqual(
      atkinson(light, 32, 8)
    );
  });

  it('keeps every pixel whose light has hardly moved', () => {
    const next = steadyAtkinson(32, 8);
    const first = next(gradient(32, 8));
    const nudged = gradient(32, 8).map((v) => Math.min(1, v + 0.05));
    expect(next(nudged)).toEqual(first);
  });

  it('redraws where the light has moved', () => {
    const next = steadyAtkinson(4, 1);
    next([1, 1, 1, 1]);
    const after = next([0, 0, 1, 1]);
    expect([...after.bytes]).toEqual([0xc0]);
  });

  it('passes on less of the error when weaker, leaving flatter areas', () => {
    const grey = Array(64 * 64).fill(0.3);
    const ink = (strength: number) => {
      const bits = steadyAtkinson(64, 64, { strength })(grey);
      let n = 0;
      for (let y = 0; y < 64; y++)
        for (let x = 0; x < 64; x++) if (getPixel(bits, x, y)) n++;
      return n / (64 * 64);
    };
    // Weaker, a dark grey falls to black sooner: bolder, flatter shapes.
    expect(ink(0.6)).toBeGreaterThan(ink(1));
  });
});
