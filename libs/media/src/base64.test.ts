import { describe, expect, it } from 'vitest';
import { fromBase64, toBase64 } from './base64.js';

describe('base64', () => {
  it('round-trips bytes, large ones too', () => {
    const bytes = Uint8Array.from({ length: 200_000 }, (_, i) => i % 251);
    expect(fromBase64(toBase64(bytes))).toEqual(bytes);
  });

  it('accepts only one spelling of the same bytes', () => {
    expect(toBase64(Uint8Array.of(1, 2))).toBe('AQI=');
    expect(fromBase64('AQI')).toBeNull();
    expect(fromBase64('AQ I=')).toBeNull();
    expect(fromBase64('AQJ=')).toBeNull();
    expect(fromBase64('!!!!')).toBeNull();
  });
});
