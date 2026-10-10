import { describe, expect, it } from 'vitest';
import { Drawing } from './drawing.js';

const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const picture = () => {
  const bytes = new Uint8Array(Drawing.BYTES);
  bytes[100] = 0b1000_0001;
  return bytes;
};
const errorFor = (raw: string) => {
  const result = Drawing.parse(raw);
  return result.ok ? null : result.error;
};

describe('Drawing.parse', () => {
  it('accepts a 256×160 picture with some ink', () => {
    const raw = encode(picture());
    expect(Drawing.parse(raw)).toEqual({ ok: true, value: raw });
  });

  it('rejects a blank picture', () => {
    expect(errorFor(encode(new Uint8Array(Drawing.BYTES)))).toEqual({
      type: 'InvalidInput',
      field: 'drawing',
      reason: 'Drawing must not be blank',
    });
  });

  it('rejects any other size', () => {
    for (const size of [0, Drawing.BYTES - 1, Drawing.BYTES + 1]) {
      const bytes = new Uint8Array(size).fill(1);
      expect(errorFor(encode(bytes))).toMatchObject({ field: 'drawing' });
    }
  });

  it('rejects text that is not canonical base64', () => {
    // 5,120 bytes leave a remainder of 2, so the canonical spelling ends in "=".
    const raw = encode(picture());
    for (const bad of ['not base64!', ` ${raw}`, raw.replace(/=+$/, '')]) {
      expect(errorFor(bad)).toMatchObject({ field: 'drawing' });
    }
  });
});
