import { decodeSound, isValidFrameCount, type SoundCodes } from '@msgr/media';

/** A sound as the server lists it: its length, and where its bytes are. */
export interface KeptSound {
  readonly frames: number;
  readonly url: string;
}

/** The codes, or null for a length no sound has. */
export function fromBytes(
  { frames }: { readonly frames: number },
  coded: Uint8Array
): SoundCodes | null {
  if (!isValidFrameCount(frames)) return null;
  return decodeSound(coded, frames);
}
