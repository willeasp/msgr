import { blank, setPixel, toBase64 } from '@msgr/media';
import { deflateRawSync } from 'node:zlib';
import { Picture } from '../domain/picture.js';
import { Avatar } from '../domain/user.js';
import { zlibPictureCodec } from '../infrastructure/zlib-picture-codec.js';

/** A picture as a browser sends it: `width`×`height`, inked at (0, `ink`). */
export function pictureInput(width = 13, height = 7, ink = 0) {
  const bits = blank(width, height);
  setPixel(bits, 0, ink, true);
  return { width, height, bits: toBase64(deflateRawSync(bits.bytes)) };
}

/** The same picture, parsed as the server keeps it. */
export function examplePicture(...args: Parameters<typeof pictureInput>) {
  const parsed = Picture.parse(pictureInput(...args), zlibPictureCodec);
  if (!parsed.ok) throw new Error(parsed.error.reason);
  return parsed.value;
}

/** A profile picture, parsed as the server keeps it, inked at (0, `ink`). */
export function exampleAvatar(ink = 0) {
  const parsed = Avatar.parse(pictureInput(64, 64, ink), zlibPictureCodec);
  if (!parsed.ok) throw new Error(parsed.error.reason);
  return parsed.value;
}
