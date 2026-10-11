import { blank, setPixel, toBase64 } from '@msgr/bitmap';
import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { zlibPictureCodec } from '../infrastructure/zlib-picture-codec.js';
import { Picture } from './picture.js';

const inked = (width: number, height: number) => {
  const bits = blank(width, height);
  setPixel(bits, 0, 0, true);
  return bits;
};
const wire = (width: number, height: number, bytes: Uint8Array) => ({
  width,
  height,
  bits: toBase64(deflateRawSync(bytes)),
});
const errorFor = (raw: Parameters<typeof Picture.parse>[0]) => {
  const result = Picture.parse(raw, zlibPictureCodec);
  return result.ok ? null : result.error.reason;
};

describe('Picture.parse', () => {
  it('accepts a picture of any shape up to 320 a side, and compresses it itself', () => {
    const { bytes } = inked(13, 320);
    // Stored, not compressed: the server's own DEFLATE is what's kept.
    const stored = deflateRawSync(bytes, { level: 0 });
    const result = Picture.parse(
      { width: 13, height: 320, bits: toBase64(stored) },
      zlibPictureCodec
    );
    if (!result.ok) throw new Error(result.error.reason);
    expect(result.value).toMatchObject({ width: 13, height: 320 });
    expect(result.value.deflated.length).toBeLessThan(stored.length);
    expect(
      zlibPictureCodec.inflate(result.value.deflated, bytes.length)
    ).toEqual(bytes);
  });

  it('rejects sides outside 1 to 320, before decoding anything', () => {
    for (const [width, height] of [
      [0, 10],
      [321, 10],
      [10, 1.5],
    ] as const) {
      expect(errorFor({ width, height, bits: '' })).toBe(
        'Picture must be 1 to 320 pixels a side'
      );
    }
  });

  it('rejects bits that are not canonical base64', () => {
    const { bits } = wire(8, 1, Uint8Array.of(1));
    expect(errorFor({ width: 8, height: 1, bits: ` ${bits}` })).toBe(
      'Picture must be base64'
    );
  });

  it('rejects a payload longer than any honest picture, before decoding it', () => {
    expect(errorFor({ width: 8, height: 8, bits: 'A'.repeat(100_000) })).toBe(
      'Picture is too large for its size'
    );
  });

  it('rejects bits that inflate to more or less than the size says', () => {
    for (const bytes of [
      new Uint8Array(7).fill(1),
      new Uint8Array(9).fill(1),
    ]) {
      expect(errorFor(wire(8, 8, bytes))).toBe(
        'Picture does not match its size'
      );
    }
    expect(
      errorFor({ width: 8, height: 8, bits: toBase64(Uint8Array.of(0xff)) })
    ).toBe('Picture does not match its size');
  });

  it('rejects a blank picture', () => {
    expect(errorFor(wire(8, 8, new Uint8Array(8)))).toBe(
      'Picture must not be blank'
    );
  });

  it('names the picture as the field at fault', () => {
    const result = Picture.parse(
      { width: 0, height: 0, bits: '' },
      zlibPictureCodec
    );
    expect(result).toMatchObject({ ok: false, error: { field: 'picture' } });
  });
});
