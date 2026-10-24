import { analyseSound, encodeSound, SOUND_RATE } from '@msgr/media';
import { describe, expect, it } from 'vitest';
import { fromBytes, toWire } from './sound-wire';

const tone = Float32Array.from({ length: SOUND_RATE / 2 }, (_, i) =>
  Math.sin((2 * Math.PI * 300 * i) / SOUND_RATE)
);

describe('a sound on the wire', () => {
  it('is sent as its codes, and read back from the bytes kept', () => {
    const codes = analyseSound(tone);
    expect(toWire(codes).frames).toBe(codes.frames);
    expect(fromBytes(codes, encodeSound(codes))).toEqual(codes);
  });

  it('is nothing for a length no sound has', () => {
    const coded = encodeSound(analyseSound(tone));
    expect(fromBytes({ frames: 1 }, coded)).toBeNull();
    expect(fromBytes({ frames: 3002 }, coded)).toBeNull();
  });
});
