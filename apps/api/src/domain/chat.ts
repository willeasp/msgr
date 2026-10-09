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

/**
 * An open, named chat that any user can find and join, IRC-style: "#general".
 * Like any chat, only its participants can read it.
 */
export interface ChannelChat {
  readonly kind: 'channel';
  readonly id: ChatId;
  readonly name: ChannelName;
  readonly participantIds: readonly UserId[];
}

export type Chat = DirectChat | GroupChat | ChannelChat;

/**
 * A chat now includes someone who didn't open it themselves: the person they
 * invited signed up (and their direct chat began), or someone added them to a
 * channel. `by` is whoever caused it.
 */
export interface ChatAdded {
  readonly chat: Chat;
  readonly by: UserId;
  readonly reason: 'invite-accepted' | 'added-to-channel';
}

/**
 * A channel's name without its "#": lower-case letters, digits and dashes,
 * starting with a letter or digit. Spaces become dashes, as people type them.
 */
export type ChannelName = Brand<string, 'ChannelName'>;
export const ChannelName = {
  MAX_LENGTH: 30,
  parse(raw: string): Result<ChannelName, InvalidInput> {
    const name = raw
      .trim()
      .replace(/^#/, '')
      .toLowerCase()
      .replace(/\s+/g, '-');
    if (
      name.length > ChannelName.MAX_LENGTH ||
      !/^[a-z0-9][a-z0-9-]*$/.test(name)
    ) {
      return err(
        invalidInput('name', 'Use letters, numbers and dashes, like #general')
      );
    }
    return ok(name as ChannelName);
  },
};

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
