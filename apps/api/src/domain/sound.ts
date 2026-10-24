import {
  decodeSound,
  encodeSound,
  fromBase64,
  isSilent,
  isValidFrameCount,
  LONGEST_SOUND,
  maxSoundCodedLength,
} from '@msgr/media';
import type { Brand } from './brand.js';
import { invalidInput, type InvalidInput } from './errors.js';
import { err, ok, type Result } from './result.js';

/**
 * What's known of a kept sound without its bytes, which are fetched on their
 * own: never the bytes too, so a sound can't pass for one.
 */
export interface SoundLength {
  readonly frames: number;
  readonly coded?: never;
}

/**
 * A squashed sound, up to a minute long, coded exactly as `encodeSound`
 * codes it: `frames` frames of 20 ms, which play `(frames - 1) × 160`
 * samples at 8,000 a second. Never silent. Its length and codes were
 * checked against each other once, here.
 */
export type Sound = Brand<
  Omit<SoundLength, 'coded'> & { readonly coded: Uint8Array<ArrayBuffer> },
  'Sound'
>;

/** A sound as a browser sends it: its codes from `encodeSound`, in base64. */
export interface RawSound {
  readonly frames: number;
  readonly bits: string;
}

const fail = (reason: string) => err(invalidInput('sound', reason));

export const Sound = {
  parse(raw: RawSound): Result<Sound, InvalidInput> {
    const { frames } = raw;
    if (!isValidFrameCount(frames)) {
      return fail(`Sound must be up to ${LONGEST_SOUND} seconds long`);
    }
    // Refuse more than any honest sound before decoding a byte. Decoding
    // does a fixed amount of work for the length, whatever the bytes say.
    const max = maxSoundCodedLength(frames);
    if (raw.bits.length > 4 * Math.ceil(max / 3)) {
      return fail('Sound is too large for its length');
    }
    const coded = fromBase64(raw.bits);
    if (!coded) return fail('Sound must be base64');
    const codes = decodeSound(coded, frames);
    // As for movies: any bytes decode to some sound, so only exactly what
    // encodeSound makes of the codes is taken.
    if (!sameBytes(encodeSound(codes), coded)) {
      return fail('Sound is not coded as encodeSound codes it');
    }
    if (isSilent(codes)) return fail('Sound must not be silent');
    return ok({ frames, coded } as Sound);
  },
};

const sameBytes = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((byte, i) => byte === b[i]);
