import { blank, getPixel, setPixel, toBase64 } from '@msgr/bitmap';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { fromWire, toWire } from './picture-wire';

const picture = () => {
  const bits = blank(13, 7);
  setPixel(bits, 12, 6, true);
  return bits;
};

describe('pictures on the wire', () => {
  it('compresses with raw DEFLATE, as the server reads it', async () => {
    const wire = await toWire(picture());
    expect(wire).toMatchObject({ width: 13, height: 7 });
    expect(
      new Uint8Array(inflateRawSync(Buffer.from(wire.bits, 'base64')))
    ).toEqual(picture().bytes);
  });

  it('round-trips', async () => {
    const back = await fromWire(await toWire(picture()));
    expect(back).toEqual(picture());
    expect(back && getPixel(back, 12, 6)).toBe(true);
  });

  it('refuses bits that are not exactly the size they claim', async () => {
    const wire = { width: 13, height: 7 };
    for (const length of [13, 15, 100_000]) {
      const bits = toBase64(deflateRawSync(new Uint8Array(length)));
      expect(await fromWire({ ...wire, bits })).toBeNull();
    }
    expect(await fromWire({ ...wire, bits: 'not base64!' })).toBeNull();
    expect(
      await fromWire({ ...wire, bits: toBase64(Uint8Array.of(9)) })
    ).toBeNull();
  });
});
