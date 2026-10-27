import { encodeMovie, encodeSound } from '@msgr/media';
import type { Made } from './attachment';
import { deflated } from './picture-wire';

/*
 * A message's picture, movie or sound goes up on its own before the message
 * (ADR 0018): its bytes, raw and exactly as the server keeps them, put to
 * the address it'll be read from, under the id the message is sent under.
 * The message then only names it.
 */

/** What goes up: which part of the message it is, its size, and its bytes. */
export interface Upload {
  readonly part: 'picture' | 'movie' | 'sound';
  readonly size: Readonly<Record<string, number>>;
  readonly bytes: Uint8Array<ArrayBuffer>;
}

/** What a message's picture, movie or sound puts. */
export async function uploadOf(made: Made): Promise<Upload> {
  switch (made.kind) {
    case 'picture':
      return {
        part: 'picture',
        size: { width: made.bits.width, height: made.bits.height },
        bytes: await deflated(made.bits),
      };
    case 'movie':
      return {
        part: 'movie',
        size: {
          width: made.frames.width,
          height: made.frames.height,
          frames: made.frames.count,
        },
        bytes: encodeMovie(made.frames),
      };
    case 'sound':
      return {
        part: 'sound',
        size: { frames: made.codes.frames },
        bytes: encodeSound(made.codes),
      };
  }
}

/** Where it's put: its message's own address, with its size. */
export const uploadAddress = (id: string, { part, size }: Upload): string =>
  `/media/${encodeURIComponent(id)}/${part}?${new URLSearchParams(
    Object.entries(size).map(([name, value]) => [name, String(value)])
  )}`;

/**
 * Why the server refused it, as Not Sent. says it: the reason it gave for
 * what was put (422); none when it couldn't be reached or failed.
 */
export const whyNotUploaded = (status: number, reason: string): string | null =>
  status === 422 && reason.trim() !== '' ? reason.trim() : null;
