import type { ChatId } from './chat.js';
import type { MessageId } from './message.js';
import type { UserId } from './user.js';

/**
 * That someone other than its sender has read a message, and when they first
 * did. Reading a chat up to a message reads every message before it too.
 */
export interface Read {
  readonly messageId: MessageId;
  readonly readerId: UserId;
  readonly at: Date;
}

/** Whoever read it first comes first; at the same moment, by reader. */
export const firstReadFirst = (a: Read, b: Read): number =>
  a.at.getTime() - b.at.getTime() ||
  (a.readerId < b.readerId ? -1 : a.readerId > b.readerId ? 1 : 0);

/**
 * How many messages others sent in a chat after the last one someone read or
 * sent there: sending a message reads everything before it.
 */
export interface Unread {
  readonly chatId: ChatId;
  readonly count: number;
}

/** Someone's unread messages summed over every chat they're in: their app's badge. */
export interface UnreadTotal {
  readonly readerId: UserId;
  readonly total: number;
}
