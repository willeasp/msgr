import {
  decodeSound,
  encodeSound,
  fromBase64,
  MAX_SOUND_FRAMES,
  maxSoundCodedLength,
  toBase64,
} from '@msgr/media';
import { describe, expect, it } from 'vitest';
import { soundInput } from '../testing/sounds.js';
import { Sound, type RawSound } from './sound.js';

const errorFor = (raw: RawSound) => {
  const result = Sound.parse(raw);
  return result.ok ? null : result.error.reason;
};

describe('Sound.parse', () => {
  it('accepts a sound of up to a minute, coded as encodeSound codes it', () => {
    for (const seconds of [0.02, 1, 60]) {
      const raw = soundInput(seconds);
      const result = Sound.parse(raw);
      if (!result.ok) throw new Error(result.error.reason);
      expect(result.value.frames).toBe(raw.frames);
      expect(toBase64(result.value.coded)).toBe(raw.bits);
    }
  });

  it('refuses a length no sound has', () => {
    const { bits } = soundInput();
    for (const frames of [0, 1, 2.5, MAX_SOUND_FRAMES + 1]) {
      expect(errorFor({ frames, bits })).toBe(
        'Sound must be up to 60 seconds long'
      );
    }
  });

  it('refuses silence', () => {
    expect(errorFor(soundInput(1, 0))).toBe('Sound must not be silent');
  });

  it('refuses bits that are not base64', () => {
    expect(errorFor({ frames: 10, bits: 'not base64!' })).toBe(
      'Sound must be base64'
    );
  });

  it('refuses more bytes than any honest sound of its length, before decoding', () => {
    const bytes = new Uint8Array(maxSoundCodedLength(10) + 3).fill(0x55);
    expect(errorFor({ frames: 10, bits: toBase64(bytes) })).toBe(
      'Sound is too large for its length'
    );
  });

  it('takes only exactly what encodeSound makes of what the bytes decode to', () => {
    const raw = soundInput(1);
    const coded = fromBase64(raw.bits);
    if (!coded) throw new Error('soundInput makes base64');
    // Trailing bytes decode to the same codes.
    const padded = toBase64(Uint8Array.from([...coded, 0, 0, 0]));
    expect(errorFor({ frames: raw.frames, bits: padded })).toBe(
      'Sound is not coded as encodeSound codes it'
    );
    // A few bytes can say a long, loud sound.
    const few = Uint8Array.from([0x12, 0xff, 0xee, 0x80, 0x7f, 0x01, 0xfe]);
    const loud = decodeSound(few, MAX_SOUND_FRAMES);
    expect(encodeSound(loud)).not.toEqual(few);
    expect(errorFor({ frames: MAX_SOUND_FRAMES, bits: toBase64(few) })).toBe(
      'Sound is not coded as encodeSound codes it'
    );
  });
});
