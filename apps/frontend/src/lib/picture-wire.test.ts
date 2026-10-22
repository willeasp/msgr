import { blank, getPixel, setPixel } from '@msgr/media';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { fromBytes, toWire } from './picture-wire';

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

  it('reads back the bytes the server keeps', async () => {
    const kept = new Uint8Array(deflateRawSync(picture().bytes));
    const back = await fromBytes({ width: 13, height: 7 }, kept);
    expect(back).toEqual(picture());
    expect(back && getPixel(back, 12, 6)).toBe(true);
  });

  it('refuses bytes that are not exactly the size they claim', async () => {
    const size = { width: 13, height: 7 };
    for (const length of [13, 15, 100_000]) {
      const kept = new Uint8Array(deflateRawSync(new Uint8Array(length)));
      expect(await fromBytes(size, kept)).toBeNull();
    }
    expect(await fromBytes(size, Uint8Array.of(9))).toBeNull();
    // The same bytes are a picture of the size they fill, and no other.
    const filled = new Uint8Array(
      deflateRawSync(new Uint8Array(20).fill(0xff))
    );
    expect(await fromBytes({ width: 16, height: 10 }, filled)).toMatchObject({
      width: 16,
      height: 10,
    });
    expect(await fromBytes({ width: 16, height: 11 }, filled)).toBeNull();
  });
});
