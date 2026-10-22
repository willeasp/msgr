import type { Bits, Frames, SoundCodes } from '@msgr/media';
import {
  fromBytes as movieFromBytes,
  type KeptMovie,
} from '../../lib/movie-wire';
import { onceEach } from '../../lib/once';
import {
  fromBytes as pictureFromBytes,
  type KeptPicture,
} from '../../lib/picture-wire';
import {
  fromBytes as soundFromBytes,
  type KeptSound,
} from '../../lib/sound-wire';

/*
 * Pictures, movies and sounds, fetched from their addresses (ADR 0012) and
 * decoded once a session, each where it's first shown. The browser keeps the
 * bytes too, so a later visit reads them from disk. What the viewer just
 * sent is kept as they made it, and never fetched back.
 */

/** The bytes at a media address; null if the server has none for us. Throws while offline. */
async function bytesAt(url: string): Promise<Uint8Array<ArrayBuffer> | null> {
  const response = await fetch(url);
  if (!response.ok) return null;
  return new Uint8Array(await response.arrayBuffer());
}

// Keyed by address alone: an address names its bytes and their shape for good.
const pictures = onceEach<Bits>();
const movies = onceEach<Frames>();
const sounds = onceEach<SoundCodes>();

/** A picture's bits, if they're here already: shown at once, without a blank frame. */
export const pictureNow = (picture: KeptPicture) => pictures.now(picture.url);

/** A picture's bits, fetched and inflated once. Shared between callers: copy before changing it. */
export const pictureAt = (picture: KeptPicture): Promise<Bits | null> =>
  pictures.get(picture.url, async () => {
    const bytes = await bytesAt(picture.url);
    return bytes && pictureFromBytes(picture, bytes);
  });

export const movieNow = (movie: KeptMovie) => movies.now(movie.url);

/** A movie's frames, fetched and decoded once. Shared between callers: copy before changing it. */
export const movieAt = (movie: KeptMovie): Promise<Frames | null> =>
  movies.get(movie.url, async () => {
    const bytes = await bytesAt(movie.url);
    return bytes && movieFromBytes(movie, bytes);
  });

export const soundNow = (sound: KeptSound) => sounds.now(sound.url);

/** A sound's codes, fetched and decoded once. Shared between callers: never change them. */
export const soundAt = (sound: KeptSound): Promise<SoundCodes | null> =>
  sounds.get(sound.url, async () => {
    const bytes = await bytesAt(sound.url);
    return bytes && soundFromBytes(sound, bytes);
  });

/** What the viewer just sent, kept as they made it: their own message never downloads. */
export const keepSent = {
  picture: (url: string, bits: Bits) => pictures.put(url, bits),
  movie: (url: string, frames: Frames) => movies.put(url, frames),
  sound: (url: string, codes: SoundCodes) => sounds.put(url, codes),
};
