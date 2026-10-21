import type { Brand } from './brand.js';
import type { ChatId } from './chat.js';
import { invalidInput, type InvalidInput } from './errors.js';
import type { Movie } from './movie.js';
import type { Picture } from './picture.js';
import { err, ok, type Result } from './result.js';
import type { Sound } from './sound.js';
import type { UserId } from './user.js';

export type MessageId = Brand<string, 'MessageId'>;
export const MessageId = (value: string): MessageId => value as MessageId;

interface Sent {
  readonly id: MessageId;
  readonly chatId: ChatId;
  readonly senderId: UserId;
  readonly createdAt: Date;
}

/** A picture, a movie or a sound: one of them, never two. */
type Attached =
  | { readonly picture: Picture; readonly movie: null; readonly sound: null }
  | { readonly picture: null; readonly movie: Movie; readonly sound: null }
  | { readonly picture: null; readonly movie: null; readonly sound: Sound };
type Unattached = {
  readonly picture: null;
  readonly movie: null;
  readonly sound: null;
};
const unattached: Unattached = { picture: null, movie: null, sound: null };

/**
 * What a message says: text, a picture, a movie or a sound, or text with one
 * of them; never neither. When there is no text, something is attached, and
 * the type says so.
 */
export type MessageBody =
  | ({ readonly content: MessageContent } & (Attached | Unattached))
  | ({ readonly content: null } & Attached);
export const MessageBody = {
  of(
    content: MessageContent | null,
    picture: Picture | null,
    movie: Movie | null,
    sound: Sound | null
  ): Result<MessageBody, InvalidInput> {
    const count = [picture, movie, sound].filter((it) => it !== null).length;
    if (count > 1) {
      return err(
        invalidInput(
          sound ? 'sound' : 'movie',
          'Attach one picture, movie or sound, not two'
        )
      );
    }
    const attached: Attached | null =
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

/** Posted by a participant to a chat. */
export type Message = Sent & MessageBody;

/** A message that has been accepted but not yet stored. */
export type NewMessage = Omit<Sent, 'id'> & MessageBody;

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
