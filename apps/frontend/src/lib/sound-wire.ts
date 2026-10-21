import {
  decodeSound,
  encodeSound,
  fromBase64,
  isValidFrameCount,
  toBase64,
  type SoundCodes,
} from '@msgr/bitmap';

/** A sound as GraphQL carries it: its codes from `encodeSound`, in base64. */
export interface WireSound {
  readonly frames: number;
  readonly bits: string;
}

export const toWire = (codes: SoundCodes): WireSound => ({
  frames: codes.frames,
  bits: toBase64(encodeSound(codes)),
});

/** The codes, or null for a length no sound has or bits that aren't base64. */
export function fromWire({ frames, bits }: WireSound): SoundCodes | null {
  if (!isValidFrameCount(frames)) return null;
  const coded = fromBase64(bits);
  return coded && decodeSound(coded, frames);
}

// Each sound decoded once a session.
// shortcut: never evicted; at most 500 KB of codes each, fine for a few chats.
const decoded = new Map<string, SoundCodes | null>();

/** What tells one sound from another, whichever object carries it. */
export const soundKey = (sound: WireSound) => `${sound.frames}:${sound.bits}`;

/** `fromWire`, remembered. Shared between callers: never change it. */
export function soundCodes(sound: WireSound): SoundCodes | null {
  const key = soundKey(sound);
  if (!decoded.has(key)) decoded.set(key, fromWire(sound));
  return decoded.get(key) ?? null;
}
