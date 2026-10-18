import {
  decodeMovie,
  encodeMovie,
  frameOf,
  fromBase64,
  isBlank,
  isValidSize,
  MAX_FRAMES,
  MAX_SIDE,
  maxCodedLength,
} from '@msgr/bitmap';
import type { Brand } from './brand.js';
import { invalidInput, type InvalidInput } from './errors.js';
import { err, ok, type Result } from './result.js';

/**
 * A black-and-white movie, 1 to 320 pixels a side and 1 to 48 frames, played
 * at 8 frames a second, looping. Its frames are in the `@msgr/bitmap` layout,
 * coded exactly as `encodeMovie` codes them. Never blank. Its size, frames
 * and bits were checked against each other once, here.
 */
export type Movie = Brand<
  {
    readonly width: number;
    readonly height: number;
    readonly frames: number;
    readonly coded: Uint8Array<ArrayBuffer>;
  },
  'Movie'
>;

/** A movie as a browser sends it: its frames coded by `encodeMovie`, in base64. */
export interface RawMovie {
  readonly width: number;
  readonly height: number;
  readonly frames: number;
  readonly bits: string;
}

const fail = (reason: string) => err(invalidInput('movie', reason));

export const Movie = {
  parse(raw: RawMovie): Result<Movie, InvalidInput> {
    const { width, height, frames } = raw;
    if (!isValidSize(width, height)) {
      return fail(`Movie must be 1 to ${MAX_SIDE} pixels a side`);
    }
    if (!Number.isInteger(frames) || frames < 1 || frames > MAX_FRAMES) {
      return fail(`Movie must have 1 to ${MAX_FRAMES} frames`);
    }
    // Refuse more than any honest movie before decoding a byte. Decoding
    // does a fixed amount of work for the size, whatever the bytes say.
    const max = maxCodedLength(width, height, frames);
    if (raw.bits.length > 4 * Math.ceil(max / 3)) {
      return fail('Movie is too large for its size');
    }
    const coded = fromBase64(raw.bits);
    if (!coded) return fail('Movie must be base64');
    const movie = decodeMovie(coded, width, height, frames);
    // Any bytes decode to some movie, and a few can decode to a busy one
    // far bigger than they are. Only exactly what encodeMovie makes of the
    // frames is taken, so what's kept is never more than what was sent.
    if (!sameBytes(encodeMovie(movie), coded)) {
      return fail('Movie is not coded as encodeMovie codes it');
    }
    const stills = Array.from({ length: frames }, (_, f) => frameOf(movie, f));
    if (stills.every(isBlank)) return fail('Movie must not be blank');
    return ok({ width, height, frames, coded } as Movie);
  },
};

const sameBytes = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((byte, i) => byte === b[i]);
