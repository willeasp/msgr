import {
  byteLength,
  encodeMovie,
  frameOf,
  setPixel,
  toBase64,
} from '@msgr/bitmap';
import { Movie } from '../domain/movie.js';

/**
 * A movie as a browser sends it: `width`×`height`, `frames` long, each frame
 * inked at (frame + `ink`, 0), a dot walking right.
 */
export function movieInput(width = 13, height = 7, frames = 3, ink = 0) {
  const movie = {
    width,
    height,
    count: frames,
    bytes: new Uint8Array(byteLength(width, height) * frames),
  };
  for (let f = 0; f < frames; f++) {
    setPixel(frameOf(movie, f), f + ink, 0, true);
  }
  return { width, height, frames, bits: toBase64(encodeMovie(movie)) };
}

/** The same movie, parsed as the server keeps it. */
export function exampleMovie(...args: Parameters<typeof movieInput>) {
  const parsed = Movie.parse(movieInput(...args));
  if (!parsed.ok) throw new Error(parsed.error.reason);
  return parsed.value;
}
