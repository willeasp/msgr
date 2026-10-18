import {
  byteLength,
  decodeMovie,
  encodeMovie,
  frameOf,
  fromBase64,
  isBlank,
  isValidSize,
  MAX_FRAMES,
  MAX_SIDE,
} from '@msgr/bitmap';
import type { Brand } from './brand.js';
import { invalidInput, type InvalidInput } from './errors.js';
import { err, ok, type Result } from './result.js';

/**
 * A black-and-white movie, 1 to 320 pixels a side and 1 to 48 frames, played
 * at 8 frames a second, looping. Its frames are in the `@msgr/bitmap` layout,
 * coded by `encodeMovie` on this server. Never blank. Its size, frames and
 * bits were checked against each other once, here.
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
    const size = byteLength(width, height) * frames;
    // Coding noise costs about a bit a pixel; refuse much more before
    // decoding a byte. Decoding itself does a fixed amount of work for the
    // size, whatever the bytes say.
    if (raw.bits.length > 4 * Math.ceil((size + size / 8 + 64) / 3)) {
      return fail('Movie is too large for its size');
    }
    const coded = fromBase64(raw.bits);
    if (!coded) return fail('Movie must be base64');
    const movie = decodeMovie(coded, width, height, frames);
    const stills = Array.from({ length: frames }, (_, f) => frameOf(movie, f));
    if (stills.every(isBlank)) return fail('Movie must not be blank');
    // Coded again here, so what's kept is never the sender's bytes.
    return ok({ width, height, frames, coded: encodeMovie(movie) } as Movie);
  },
};
