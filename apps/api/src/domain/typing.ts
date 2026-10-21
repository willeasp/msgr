import type { Chat, ChatId } from './chat.js';
import type { User, UserId } from './user.js';

/**
 * Someone writing a message to a chat, as its other participants are told.
 * It lasts a few seconds unless it comes again; their message ends it.
 */
export interface Typing {
  readonly chatId: ChatId;
  readonly user: User;
}

/** Everyone in the chat but the one typing: nobody is told about themselves. */
export const typingRecipients = (chat: Chat, typist: UserId): UserId[] =>
  chat.participantIds.filter((id) => id !== typist);
