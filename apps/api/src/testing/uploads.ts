import { fromBase64 } from '@msgr/media';
import type { RawUpload } from '../domain/upload.js';
import { movieInput } from './movies.js';
import { pictureInput } from './pictures.js';
import { soundInput } from './sounds.js';

/** What a browser puts ahead of its message: which part, its size, and its raw bytes. */
export interface Put {
  readonly raw: RawUpload;
  readonly bytes: Uint8Array;
}

const bytesOf = (bits: string) => {
  const bytes = fromBase64(bits);
  if (!bytes) throw new Error('not base64');
  return bytes;
};

/** A picture as a browser puts it: `pictureInput`'s, raw. */
export function pictureUpload(...args: Parameters<typeof pictureInput>): Put {
  const { width, height, bits } = pictureInput(...args);
  return { raw: { part: 'picture', width, height }, bytes: bytesOf(bits) };
}

/** A movie as a browser puts it: `movieInput`'s, raw. */
export function movieUpload(...args: Parameters<typeof movieInput>): Put {
  const { width, height, frames, bits } = movieInput(...args);
  return {
    raw: { part: 'movie', width, height, frames },
    bytes: bytesOf(bits),
  };
}

/** A sound as a browser puts it: `soundInput`'s, raw. */
export function soundUpload(...args: Parameters<typeof soundInput>): Put {
  const { frames, bits } = soundInput(...args);
  return { raw: { part: 'sound', frames }, bytes: bytesOf(bits) };
}
