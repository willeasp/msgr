import {
  byteLength,
  clearPadding,
  fromBase64,
  isBlank,
  isValidSize,
  MAX_SIDE,
} from '@msgr/media';
import type { Brand } from './brand.js';
import { invalidInput, type InvalidInput } from './errors.js';
import { err, ok, type Result } from './result.js';

/** Raw DEFLATE, kept out of the domain: zlib on the server. */
export interface PictureCodec {
  /** The bytes, or null if they aren't DEFLATE or exceed `maxBytes`. */
  inflate(
    deflated: Uint8Array,
    maxBytes: number
  ): Uint8Array<ArrayBuffer> | null;
  deflate(bytes: Uint8Array): Uint8Array<ArrayBuffer>;
}

/**
 * What's known of a kept picture without its bytes, which are fetched on
 * their own: never the bytes too, so a picture can't pass for one.
 */
export interface PictureSize {
  readonly width: number;
  readonly height: number;
  readonly deflated?: never;
}

/**
 * A black-and-white picture, 1 to 320 pixels a side, in the `@msgr/media`
 * layout, compressed with raw DEFLATE by this server. Never blank. Its width,
 * height and bytes were checked against each other once, here.
 */
export type Picture = Brand<
  {
    readonly width: number;
    readonly height: number;
    readonly deflated: Uint8Array<ArrayBuffer>;
  },
  'Picture'
>;

/**
 * A short name for a picture's contents (32-bit FNV-1a of its size and
 * bytes, in base 36): the same picture always has the same one, and a
 * changed one almost certainly not. An avatar's address carries it, so a
 * new avatar has a new address.
 */
export function pictureVersion({ width, height, deflated }: Picture): string {
  let hash = 0x811c9dc5;
  const mix = (byte: number) => {
    hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  };
  for (const side of [width, height]) {
    mix(side & 0xff);
    mix(side >> 8);
  }
  for (const byte of deflated) mix(byte);
  return hash.toString(36);
}

/** A picture as a browser sends it: its bits raw-DEFLATEd, in base64. */
export interface RawPicture {
  readonly width: number;
  readonly height: number;
  readonly bits: string;
}

const fail = (reason: string) => err(invalidInput('picture', reason));

export const Picture = {
  parse(raw: RawPicture, codec: PictureCodec): Result<Picture, InvalidInput> {
    const { width, height } = raw;
    if (!isValidSize(width, height)) {
      return fail(`Picture must be 1 to ${MAX_SIDE} pixels a side`);
    }
    const size = byteLength(width, height);
    // Noise barely compresses, but never to twice its size: refuse more
    // before decoding a byte of it.
    if (raw.bits.length > 4 * Math.ceil((2 * size + 64) / 3)) {
      return fail('Picture is too large for its size');
    }
    const deflated = fromBase64(raw.bits);
    if (!deflated) return fail('Picture must be base64');
    const bytes = codec.inflate(deflated, size);
    if (bytes?.length !== size) return fail('Picture does not match its size');
    const bits = { width, height, bytes };
    // Ink past the right edge would never show, nor count against "blank".
    clearPadding(bits);
    if (isBlank(bits)) {
      return fail('Picture must not be blank');
    }
    // Compressed again here, so what's kept is never the sender's bytes.
    return ok({ width, height, deflated: codec.deflate(bytes) } as Picture);
  },
};
