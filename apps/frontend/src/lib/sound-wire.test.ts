import { analyseSound, SOUND_RATE } from '@msgr/bitmap';
import { describe, expect, it } from 'vitest';
import { fromWire, soundCodes, toWire } from './sound-wire';

const tone = Float32Array.from({ length: SOUND_RATE / 2 }, (_, i) =>
  Math.sin((2 * Math.PI * 300 * i) / SOUND_RATE)
);

describe('a sound on the wire', () => {
  it('comes back as the codes it was sent as', () => {
    const codes = analyseSound(tone);
    expect(fromWire(toWire(codes))).toEqual(codes);
  });

  it('is nothing for a length no sound has, or bits that are not base64', () => {
    const { bits } = toWire(analyseSound(tone));
    expect(fromWire({ frames: 1, bits })).toBeNull();
    expect(fromWire({ frames: 3002, bits })).toBeNull();
    expect(fromWire({ frames: 10, bits: '!!' })).toBeNull();
  });

  it('is decoded once, however often it is shown', () => {
    const wire = toWire(analyseSound(tone));
    expect(soundCodes({ ...wire })).toBe(soundCodes({ ...wire }));
  });
});
