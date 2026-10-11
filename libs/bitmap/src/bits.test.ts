import { describe, expect, it } from 'vitest';
import {
  blank,
  byteLength,
  fitWithin,
  getPixel,
  isBlank,
  isValidSize,
  setPixel,
} from './bits.js';

describe('bits', () => {
  it('pads each row to whole bytes, the leftmost pixel in the high bit', () => {
    const bits = blank(13, 2);
    expect(bits.bytes).toHaveLength(4);
    setPixel(bits, 0, 0, true);
    setPixel(bits, 12, 1, true);
    expect([...bits.bytes]).toEqual([0x80, 0, 0, 0x08]);
    expect(getPixel(bits, 12, 1)).toBe(true);
    expect(getPixel(bits, 11, 1)).toBe(false);
  });

  it('ignores pixels off the canvas', () => {
    const bits = blank(8, 1);
    setPixel(bits, 8, 0, true);
    setPixel(bits, -1, 0, true);
    setPixel(bits, 0, 1, true);
    expect(isBlank(bits)).toBe(true);
    expect(getPixel(bits, 8, 0)).toBe(false);
  });

  it('measures a picture by its padded rows', () => {
    expect(byteLength(256, 160)).toBe(5120);
    expect(byteLength(1, 1)).toBe(1);
    expect(byteLength(9, 3)).toBe(6);
  });

  it('allows whole sides from 1 to 320', () => {
    expect(isValidSize(320, 1)).toBe(true);
    expect(isValidSize(1, 320)).toBe(true);
    expect(isValidSize(321, 10)).toBe(false);
    expect(isValidSize(0, 10)).toBe(false);
    expect(isValidSize(10.5, 10)).toBe(false);
  });

  it('shrinks a picture to fit 320 on its long side, keeping its shape', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 320, height: 240 });
    expect(fitWithin(1000, 2000)).toEqual({ width: 160, height: 320 });
    // Never enlarged, and never thinner than a pixel.
    expect(fitWithin(40, 30)).toEqual({ width: 40, height: 30 });
    expect(fitWithin(10000, 1)).toEqual({ width: 320, height: 1 });
  });
});
