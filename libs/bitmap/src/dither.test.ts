import { describe, expect, it } from 'vitest';
import { getPixel } from './bits.js';
import { atkinson } from './dither.js';

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
