import {
  decodeMovie,
  encodeMovie,
  isValidSize,
  MAX_FRAMES,
  toBase64,
  type Frames,
} from '@msgr/media';

/** A movie as the composer sends it: its frames coded by `encodeMovie`, in base64. */
export interface WireMovie {
  readonly width: number;
  readonly height: number;
  readonly frames: number;
  readonly bits: string;
}

/** A movie as the server lists it: its size, and where its bytes are. */
export interface KeptMovie {
  readonly width: number;
  readonly height: number;
  readonly frames: number;
  readonly url: string;
}

export const toWire = (movie: Frames): WireMovie => ({
  width: movie.width,
  height: movie.height,
  frames: movie.count,
  bits: toBase64(encodeMovie(movie)),
});

/** The frames, or null for a size no movie has. */
export function fromBytes(
  {
    width,
    height,
    frames,
  }: {
    readonly width: number;
    readonly height: number;
    readonly frames: number;
  },
  coded: Uint8Array
): Frames | null {
  if (!isValidSize(width, height)) return null;
  if (!Number.isInteger(frames) || frames < 1 || frames > MAX_FRAMES)
    return null;
  return decodeMovie(coded, width, height, frames);
}
