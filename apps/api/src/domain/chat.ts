import type { Brand } from './brand.js';
import {
  invalidInput,
  notFound,
  type InvalidInput,
  type NotFound,
} from './errors.js';
import { err, ok, type Result } from './result.js';
import type { UserId } from './user.js';

export type ChatId = Brand<string, 'ChatId'>;
export const ChatId = (value: string): ChatId => value as ChatId;

/** A conversation between exactly two users. It has no title of its own. */
export interface DirectChat {
  readonly kind: 'direct';
  readonly id: ChatId;
  readonly participantIds: readonly [UserId, UserId];
}

/** A named conversation between any number of users. */
export interface GroupChat {
  readonly kind: 'group';
  readonly id: ChatId;
  readonly title: string;
  readonly participantIds: readonly UserId[];
}

export type Chat = DirectChat | GroupChat;

export const isParticipant = (chat: Chat, userId: UserId): boolean =>
  chat.participantIds.includes(userId);

/**
 * A chat the viewer is not part of does not exist for them: the error is the
 * same as for a missing chat, so nobody can probe for other people's chats.
 */
export const visibleTo = (
  chat: Chat | null,
  viewer: UserId
): Result<Chat, NotFound> =>
  chat !== null && isParticipant(chat, viewer)
    ? ok(chat)
    : err(notFound('Chat'));

/** The other side of a direct chat, as seen by `viewer`. */
export const counterpart = (chat: DirectChat, viewer: UserId): UserId => {
  const [first, second] = chat.participantIds;
  return first === viewer ? second : first;
};

/** Identifies the single direct chat two users share, regardless of who started it. */
export type DirectChatKey = Brand<string, 'DirectChatKey'>;

export interface DirectPair {
  readonly key: DirectChatKey;
  readonly participantIds: readonly [UserId, UserId];
}

export const directPair = (
  initiator: UserId,
  other: UserId
): Result<DirectPair, InvalidInput> => {
  if (initiator === other) {
    return err(
      invalidInput('participantId', 'You cannot start a chat with yourself')
    );
  }
  const participantIds = [initiator, other].sort() as [UserId, UserId];
  return ok({
    key: participantIds.join(':') as DirectChatKey,
    participantIds,
  });
};
