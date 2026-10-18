import {
  decodeMovie,
  encodeMovie,
  fromBase64,
  isValidSize,
  MAX_FRAMES,
  toBase64,
  type Frames,
} from '@msgr/bitmap';

/** A movie as GraphQL carries it: its frames coded by `encodeMovie`, in base64. */
export interface WireMovie {
  readonly width: number;
  readonly height: number;
  readonly frames: number;
  readonly bits: string;
}

export const toWire = (movie: Frames): WireMovie => ({
  width: movie.width,
  height: movie.height,
  frames: movie.count,
  bits: toBase64(encodeMovie(movie)),
});

/** The frames, or null for a size no movie has or bits that aren't base64. */
export function fromWire({
  width,
  height,
  frames,
  bits,
}: WireMovie): Frames | null {
  if (!isValidSize(width, height)) return null;
  if (!Number.isInteger(frames) || frames < 1 || frames > MAX_FRAMES)
    return null;
  const coded = fromBase64(bits);
  return coded && decodeMovie(coded, width, height, frames);
}

// Each movie decoded once a session, keyed by its shape too.
// shortcut: never evicted; up to 600 KB each, fine for the movies of a few chats.
const decoded = new Map<string, Frames | null>();

/** `fromWire`, remembered. Shared between callers: copy before changing it. */
export function movieFrames(movie: WireMovie): Frames | null {
  const key = `${movie.width}x${movie.height}x${movie.frames}:${movie.bits}`;
  if (!decoded.has(key)) decoded.set(key, fromWire(movie));
  return decoded.get(key) ?? null;
}
