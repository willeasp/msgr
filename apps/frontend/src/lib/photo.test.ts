import { getPixel } from '@msgr/media';
import { describe, expect, it } from 'vitest';
import { ditherPhoto } from './photo';

const rgba = (...pixels: [number, number, number, number][]) =>
  Uint8ClampedArray.from(pixels.flat());

describe('ditherPhoto', () => {
  it('inks dark pixels and leaves light ones, by their brightness', () => {
    const bits = ditherPhoto(
      rgba(
        [0, 0, 0, 255],
        [255, 255, 255, 255],
        [0, 0, 255, 255],
        [255, 255, 0, 255]
      ),
      4,
      1
    );
    expect(bits).toMatchObject({ width: 4, height: 1 });
    // Black, white, dark blue, light yellow.
    expect([0, 1, 2, 3].map((x) => getPixel(bits, x, 0))).toEqual([
      true,
      false,
      true,
      false,
    ]);
  });

  it('lays see-through pixels over white paper', () => {
    const bits = ditherPhoto(rgba([0, 0, 0, 0], [0, 0, 0, 0]), 2, 1);
    expect([...bits.bytes]).toEqual([0]);
  });
});
