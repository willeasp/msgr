import type { Brand } from './brand.js';
import type { ChatId } from './chat.js';
import { invalidInput, type InvalidInput } from './errors.js';
import type { Movie, MovieSize } from './movie.js';
import type { Picture, PictureSize } from './picture.js';
import { err, ok, type Result } from './result.js';
import type { Sound, SoundLength } from './sound.js';
import type { UserId } from './user.js';

export type MessageId = Brand<string, 'MessageId'>;

/** A version 4 UUID, lowercase, as `crypto.randomUUID()` makes them. */
const CHOSEN_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** A message's id: the server's own, or one its sender chose (`parse`). */
export const MessageId = Object.assign(
  (value: string): MessageId => value as MessageId,
  {
    /**
     * An id a sender chose for their message before sending it, so the
     * message shown at once and the one stored are the same, and a retry
     * can't post it twice: a version 4 UUID, never one of the server's own.
     */
    parse(raw: string): Result<MessageId, InvalidInput> {
      return CHOSEN_ID.test(raw)
        ? ok(raw as MessageId)
        : err(invalidInput('id', 'A message id is a version 4 UUID'));
    },
  }
);

interface Sent {
  readonly id: MessageId;
  readonly chatId: ChatId;
  readonly senderId: UserId;
  readonly createdAt: Date;
}

/** A picture, a movie or a sound, as P, M or S: one of them, never two. */
type Attached<P, M, S> =
  | { readonly picture: P; readonly movie: null; readonly sound: null }
  | { readonly picture: null; readonly movie: M; readonly sound: null }
  | { readonly picture: null; readonly movie: null; readonly sound: S };
type Unattached = {
  readonly picture: null;
  readonly movie: null;
  readonly sound: null;
};
const unattached: Unattached = { picture: null, movie: null, sound: null };

/**
 * Text, a picture, a movie or a sound, or text with one of them; never
 * neither. When there is no text, something is attached, and the type says
 * so. P, M and S are how much of the picture, movie or sound is held.
 */
type Body<P, M, S> =
  | ({ readonly content: MessageContent } & (Attached<P, M, S> | Unattached))
  | ({ readonly content: null } & Attached<P, M, S>);

/** What a message says as it's sent: its picture, movie or sound whole. */
export type MessageBody = Body<Picture, Movie, Sound>;

/**
 * What a kept message says: its picture's, movie's or sound's size, never
 * their bytes, which are fetched on their own (`MessageRepository.findMedia`)
 * and only by whoever shows them.
 */
export type KeptBody = Body<PictureSize, MovieSize, SoundLength>;

export const MessageBody = {
  of<P, M, S>(
    content: MessageContent | null,
    picture: P | null,
    movie: M | null,
    sound: S | null
  ): Result<Body<P, M, S>, InvalidInput> {
    const count = [picture, movie, sound].filter((it) => it !== null).length;
    if (count > 1) {
      return err(
        invalidInput(
          sound ? 'sound' : 'movie',
          'Attach one picture, movie or sound, not two'
        )
      );
    }
    const attached: Attached<P, M, S> | null =
      picture !== null
        ? { ...unattached, picture }
        : movie !== null
        ? { ...unattached, movie }
        : sound !== null
        ? { ...unattached, sound }
        : null;
    if (content !== null) return ok({ content, ...(attached ?? unattached) });
    if (attached !== null) return ok({ content, ...attached });
    return err(
      invalidInput(
        'content',
        'Write something or attach a picture, a movie or a sound'
      )
    );
  },
};

/** Posted by a participant to a chat, as kept: its media's bytes apart. */
export type Message = Sent & KeptBody;

/** A message that has been accepted but not yet stored, its media whole. */
/** A message to store: under its sender's chosen id, or a new one of the server's. */
export type NewMessage = Omit<Sent, 'id'> & {
  readonly id?: MessageId;
} & MessageBody;

/** The part of a message that has bytes of its own. */
export type MediaPart = 'picture' | 'movie' | 'sound';

/** Which part of the message has bytes of its own; null for text alone. */
export const mediaPartOf = (
  message: Body<object, object, object>
): MediaPart | null =>
  message.picture
    ? 'picture'
    : message.movie
    ? 'movie'
    : message.sound
    ? 'sound'
    : null;

/** Trimmed, non-blank, bounded message text. */
export type MessageContent = Brand<string, 'MessageContent'>;
export const MessageContent = {
  MAX_LENGTH: 4000,
  parse(raw: string): Result<MessageContent, InvalidInput> {
    const content = raw.trim();
    if (content.length === 0) {
      return err(invalidInput('content', 'Message must not be blank'));
    }
    if (content.length > MessageContent.MAX_LENGTH) {
      return err(
        invalidInput(
          'content',
          `Message must be at most ${MessageContent.MAX_LENGTH} characters`
        )
      );
    }
    return ok(content as MessageContent);
  },
};
