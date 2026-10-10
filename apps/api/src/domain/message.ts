import type { Brand } from './brand.js';
import type { ChatId } from './chat.js';
import type { Drawing } from './drawing.js';
import { invalidInput, type InvalidInput } from './errors.js';
import { err, ok, type Result } from './result.js';
import type { UserId } from './user.js';

export type MessageId = Brand<string, 'MessageId'>;
export const MessageId = (value: string): MessageId => value as MessageId;

interface Sent {
  readonly id: MessageId;
  readonly chatId: ChatId;
  readonly senderId: UserId;
  readonly createdAt: Date;
}

export interface TextMessage extends Sent {
  readonly kind: 'text';
  readonly content: MessageContent;
}

export interface DrawingMessage extends Sent {
  readonly kind: 'drawing';
  readonly drawing: Drawing;
}

/** Text or a drawing, posted by a participant to a chat. */
export type Message = TextMessage | DrawingMessage;

/** What a message says, whichever kind it is. */
export type MessageBody =
  | Pick<TextMessage, 'kind' | 'content'>
  | Pick<DrawingMessage, 'kind' | 'drawing'>;

/** A message that has been accepted but not yet stored. */
export type NewMessage = MessageBody & Omit<Sent, 'id'>;

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
