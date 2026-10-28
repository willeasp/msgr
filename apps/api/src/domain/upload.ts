import type { InvalidInput } from './errors.js';
import type { Attached, MessageId } from './message.js';
import { Movie, type MovieBytes } from './movie.js';
import { Picture, type PictureBytes, type PictureCodec } from './picture.js';
import { ok, type Result } from './result.js';
import { Sound, type SoundBytes } from './sound.js';
import type { UserId } from './user.js';

/** A message's picture, movie or sound, whole: one of them. */
export type Media = Attached<Picture, Movie, Sound>;

/**
 * A message's picture, movie or sound, put by its sender ahead of the
 * message, under the id the message will have (ADR 0018). The message takes
 * it as it's stored; until then it's its uploader's alone.
 */
export type Upload = {
  readonly id: MessageId;
  readonly uploaderId: UserId;
  readonly createdAt: Date;
} & Media;

/** An upload as a browser puts it: which part it is, its size, and its bytes. */
export type RawUpload =
  | ({ readonly part: 'picture' } & Omit<PictureBytes, 'deflated'>)
  | ({ readonly part: 'movie' } & Omit<MovieBytes, 'coded'>)
  | ({ readonly part: 'sound' } & Omit<SoundBytes, 'coded'>);

/** How long an upload whose message never comes is kept. */
export const UPLOAD_KEPT_MS = 60 * 60 * 1000;

/**
 * How many uploads one person may have waiting for their messages: their
 * newest. A page sends one message at a time per chat, so this many are
 * never waiting at once, and nobody can fill the database with ones nobody
 * sees.
 */
export const UPLOADS_KEPT_EACH = 10;

/** The most an upload's bytes may be: the largest movie's. */
export const MAX_UPLOAD_BYTES = Math.max(
  Picture.MAX_BYTES,
  Movie.MAX_BYTES,
  Sound.MAX_BYTES
);

const none = { picture: null, movie: null, sound: null } as const;

export const Upload = {
  /** The picture, movie or sound the bytes are, checked as any message's is. */
  parse(
    raw: RawUpload,
    bytes: Uint8Array,
    codec: PictureCodec
  ): Result<Media, InvalidInput> {
    switch (raw.part) {
      case 'picture': {
        const picture = Picture.parseBytes({ ...raw, deflated: bytes }, codec);
        return picture.ok ? ok({ ...none, picture: picture.value }) : picture;
      }
      case 'movie': {
        const movie = Movie.parseBytes({ ...raw, coded: bytes });
        return movie.ok ? ok({ ...none, movie: movie.value }) : movie;
      }
      case 'sound': {
        const sound = Sound.parseBytes({ ...raw, coded: bytes });
        return sound.ok ? ok({ ...none, sound: sound.value }) : sound;
      }
    }
  },
};
