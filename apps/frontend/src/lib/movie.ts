import {
  blank,
  byteLength,
  frameOf,
  isBlank,
  MOVIE_FPS,
  type Bits,
  type Frames,
} from '@msgr/media';

/**
 * What's drawn over a movie, the same over every frame: `mask` says where
 * something was drawn and `ink` what, ink or paper.
 */
export interface Drawing {
  readonly ink: Bits;
  readonly mask: Bits;
}

/** Nothing drawn yet, over a movie this size. */
export const noDrawing = (width: number, height: number): Drawing => ({
  ink: blank(width, height),
  mask: blank(width, height),
});

/** Frame `index` as shown: the drawing over it. */
export function frameShown(
  movie: Frames,
  index: number,
  drawing: Drawing | null,
  into: Bits = blank(movie.width, movie.height)
): Bits {
  const frame = frameOf(movie, index).bytes;
  if (!drawing) {
    into.bytes.set(frame);
    return into;
  }
  const { ink, mask } = drawing;
  for (let i = 0; i < frame.length; i++) {
    into.bytes[i] =
      (frame[i] & ~mask.bytes[i]) | (ink.bytes[i] & mask.bytes[i]);
  }
  return into;
}

/** The movie with the drawing in every frame, as it is sent; the movie is kept. */
export function drawnOver(movie: Frames, drawing: Drawing): Frames {
  const bytes = new Uint8Array(movie.bytes.length);
  const size = byteLength(movie.width, movie.height);
  for (let f = 0; f < movie.count; f++) {
    const into = {
      ...frameOf(movie, f),
      bytes: bytes.subarray(f * size, (f + 1) * size),
    };
    frameShown(movie, f, drawing, into);
  }
  return { ...movie, bytes };
}

/** The frame showing `ms` into a movie of `count` frames, looping. */
export const frameAt = (ms: number, count: number) =>
  Math.floor((ms * MOVIE_FPS) / 1000) % count;

/** Whether no frame has any ink: such a movie can't be sent. */
export const isBlankMovie = (movie: Frames) =>
  Array.from({ length: movie.count }, (_, f) => frameOf(movie, f)).every(
    isBlank
  );
