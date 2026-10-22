import {
  decodeSound,
  encodeSound,
  isValidFrameCount,
  toBase64,
  type SoundCodes,
} from '@msgr/media';

/** A sound as the composer sends it: its codes from `encodeSound`, in base64. */
export interface WireSound {
  readonly frames: number;
  readonly bits: string;
}

/** A sound as the server lists it: its length, and where its bytes are. */
export interface KeptSound {
  readonly frames: number;
  readonly url: string;
}

export const toWire = (codes: SoundCodes): WireSound => ({
  frames: codes.frames,
  bits: toBase64(encodeSound(codes)),
});

/** The codes, or null for a length no sound has. */
export function fromBytes(
  { frames }: { readonly frames: number },
  coded: Uint8Array
): SoundCodes | null {
  if (!isValidFrameCount(frames)) return null;
  return decodeSound(coded, frames);
}
