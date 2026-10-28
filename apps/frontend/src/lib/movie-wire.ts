import { decodeMovie, isValidSize, MAX_FRAMES, type Frames } from '@msgr/media';

/** A movie as the server lists it: its size, and where its bytes are. */
export interface KeptMovie {
  readonly width: number;
  readonly height: number;
  readonly frames: number;
  readonly url: string;
}

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
