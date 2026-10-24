import type { MessageMedia, Repositories } from '../application/ports.js';
import {
  ChatId,
  isParticipant,
  type ChannelChat,
  type Chat,
  type DirectChat,
  type DirectChatKey,
  type GroupChat,
} from '../domain/chat.js';
import type { Invite, InviteCode } from '../domain/invite.js';
import {
  mediaPartOf,
  MessageBody,
  MessageId,
  type Message,
  type NewMessage,
} from '../domain/message.js';
import type { PushSubscription } from '../domain/push.js';
import { UNREAD_LIMIT, type Read } from '../domain/read.js';
import { err, ok } from '../domain/result.js';
import {
  Email,
  UserId,
  type Credentials,
  type PasswordHash,
  type User,
} from '../domain/user.js';
import { fixtureEmail, type Fixtures } from './repository-contract.js';

interface ChatRecord {
  readonly chat: Chat;
  readonly directKey: DirectChatKey | null;
  activeAt: Date;
}

/**
 * Repositories over plain maps that honour the same contract as the Prisma
 * adapters (see `repository-contract.ts`), so services can be tested without
 * a database.
 */
export function createInMemoryRepositories(): {
  repositories: Repositories;
  fixtures: Fixtures;
} {
  const users = new Map<UserId, Credentials>();
  const chats = new Map<ChatId, ChatRecord>();
  const invites = new Map<InviteCode, { invite: Invite; used: boolean }>();
  const redeemable = (code: InviteCode, at: Date) => {
    const record = invites.get(code);
    return !!record && !record.used && at < record.invite.expiresAt;
  };
  const messages: Message[] = [];
  // Each message's picture, movie or sound bytes, kept apart as in Postgres.
  const media = new Map<MessageId, MessageMedia>();
  // Each reader's marks: how far they had read a chat, and when.
  const marks: { messageId: MessageId; readerId: UserId; at: Date }[] = [];
  const messageById = (id: MessageId) =>
    messages.find((message) => message.id === id);
  /** Marks at or after `message` in its chat. */
  const marksFrom = (message: Message) =>
    marks.filter((mark) => {
      const seen = messageById(mark.messageId);
      return seen?.chatId === message.chatId && !isBefore(seen, message);
    });
  // Each reader's place in each chat: the furthest message they've read.
  const places = new Map<string, Message>();
  const placeKey = (readerId: UserId, chatId: ChatId) =>
    `${readerId} ${chatId}`;
  /** What others sent in a chat after the last message `readerId` read or sent there. */
  const unreadIn = (chatId: ChatId, readerId: UserId) => {
    const inChat = messages.filter((message) => message.chatId === chatId);
    const seen = [
      places.get(placeKey(readerId, chatId)),
      ...inChat.filter((message) => message.senderId === readerId),
    ].reduce<Message | undefined>(
      (latest, message) =>
        !latest || (message && isBefore(latest, message)) ? message : latest,
      undefined
    );
    return Math.min(
      UNREAD_LIMIT,
      inChat.filter(
        (message) =>
          message.senderId !== readerId && (!seen || isBefore(seen, message))
      ).length
    );
  };
  const pushSubscriptions = new Map<
    string,
    { userId: UserId; subscription: PushSubscription }
  >();
  let lastId = 0;
  const nextId = () => `id-${String(++lastId).padStart(6, '0')}`;

  const requireUser = (id: UserId) => {
    if (!users.has(id)) throw new Error(`Unknown user ${id}`);
  };

  const repositories: Repositories = {
    users: {
      findByIds: async (ids) =>
        distinct(ids).flatMap((id) => users.get(id)?.user ?? []),

      findCredentials: async (email) =>
        [...users.values()].find(({ user }) => user.email === email) ?? null,

      search: async (term, { excluding, limit }) => {
        const needle = term.toLowerCase();
        return [...users.values()]
          .map(({ user }) => user)
          .filter(
            (user) =>
              user.id !== excluding &&
              (user.name.toLowerCase().includes(needle) ||
                user.email.toLowerCase().includes(needle))
          )
          .sort((a, b) => compare(a.name, b.name) || compare(a.id, b.id))
          .slice(0, limit);
      },

      saveProfile: async (id, { name, avatar }) => {
        const record = users.get(id);
        if (!record) throw new Error(`Unknown user ${id}`);
        const user = { ...record.user, name, avatar };
        users.set(id, { ...record, user });
        return user;
      },
    },

    chats: {
      findByIds: async (ids) =>
        distinct(ids).flatMap((id) => chats.get(id)?.chat ?? []),

      findByParticipant: async (userId) =>
        [...chats.values()]
          .filter(({ chat }) => isParticipant(chat, userId))
          .sort(
            (a, b) =>
              b.activeAt.getTime() - a.activeAt.getTime() ||
              compare(a.chat.id, b.chat.id)
          )
          .map(({ chat }) => chat),

      saveDirect: async ({ key, participantIds }) => {
        const existing = [...chats.values()].find((r) => r.directKey === key);
        if (existing?.chat.kind === 'direct') return existing.chat;
        participantIds.forEach(requireUser);
        const chat: DirectChat = {
          kind: 'direct',
          id: ChatId(nextId()),
          participantIds,
        };
        chats.set(chat.id, { chat, directKey: key, activeAt: new Date() });
        return chat;
      },

      findChannels: async () =>
        [...chats.values()]
          .flatMap(({ chat }) => (chat.kind === 'channel' ? [chat] : []))
          .sort((a, b) => compare(a.name, b.name)),

      joinChannel: async (name, userId) => {
        requireUser(userId);
        const record = [...chats.values()].find(
          ({ chat }) => chat.kind === 'channel' && chat.name === name
        );
        if (!record) {
          const chat: ChannelChat = {
            kind: 'channel',
            id: ChatId(nextId()),
            name,
            participantIds: [userId],
          };
          chats.set(chat.id, { chat, directKey: null, activeAt: new Date() });
          return chat;
        }
        const channel = record.chat as ChannelChat;
        const joined: ChannelChat = {
          ...channel,
          participantIds: distinct([...channel.participantIds, userId]).sort(),
        };
        chats.set(channel.id, { ...record, chat: joined });
        return joined;
      },

      leaveChannel: async (chatId, userId) => {
        const record = chats.get(chatId);
        if (record?.chat.kind !== 'channel') return;
        chats.set(chatId, {
          ...record,
          chat: {
            ...record.chat,
            participantIds: record.chat.participantIds.filter(
              (id) => id !== userId
            ),
          },
        });
      },
    },

    invites: {
      create: async (invite) => {
        invites.set(invite.code, { invite, used: false });
      },

      isRedeemable: async (code, at) => redeemable(code, at),

      redeem: async (code, { email, name, passwordHash }, at) => {
        const record = invites.get(code);
        if (!record || !redeemable(code, at)) return err('InviteUnavailable');
        if ([...users.values()].some(({ user }) => user.email === email)) {
          return err('EmailTaken');
        }
        const user: User = { id: UserId(nextId()), email, name, avatar: null };
        users.set(user.id, { user, passwordHash });
        invites.set(code, { ...record, used: true });
        return ok({ user, invitedBy: record.invite.invitedBy });
      },
    },

    messages: {
      findByIds: async (ids) =>
        messages.filter((message) => ids.includes(message.id)),

      findPages: async (chatIds, page) =>
        distinct(chatIds).flatMap((chatId) => {
          const history = messages
            .filter((message) => message.chatId === chatId)
            .sort((a, b) => (isBefore(a, b) ? 1 : -1));
          if (page.kind === 'newest') {
            return history
              .slice(page.offset, page.offset + page.limit)
              .reverse();
          }
          const at = history.findIndex((message) => message.id === page.cursor);
          if (at === -1) return [];
          const window =
            page.kind === 'before'
              ? history.slice(at + 1)
              : history.slice(0, at);
          return window.slice(0, page.limit).reverse();
        }),

      findMedia: async (ids) =>
        distinct(ids).flatMap((messageId) => {
          const kept = media.get(messageId);
          return kept ? [kept] : [];
        }),

      append: async (input) => {
        const record = chats.get(input.chatId);
        if (!record) throw new Error(`Unknown chat ${input.chatId}`);
        requireUser(input.senderId);
        if (input.id && messageById(input.id)) {
          throw new Error(`Duplicate message id ${input.id}`);
        }
        const message = keep(input.id ?? MessageId(nextId()), input);
        const part = mediaPartOf(input);
        const bytes =
          input.picture?.deflated ?? input.movie?.coded ?? input.sound?.coded;
        if (part && bytes) {
          media.set(message.id, { messageId: message.id, part, bytes });
        }
        messages.push(message);
        record.activeAt = input.createdAt;
        return message;
      },
    },

    reads: {
      markRead: async (message, readerId, at) => {
        requireUser(readerId);
        if (!messageById(message.id)) {
          throw new Error(`Unknown message ${message.id}`);
        }
        // Only forward, and a mark only when it moves.
        const key = placeKey(readerId, message.chatId);
        const place = places.get(key);
        if (place && !isBefore(place, message)) return;
        places.set(key, message);
        marks.push({ messageId: message.id, readerId, at });
      },

      startReading: async (chatId, readerIds) => {
        const [, beforeNewest] = messages
          .filter((message) => message.chatId === chatId)
          .sort((a, b) => (isBefore(a, b) ? 1 : -1));
        if (!beforeNewest) return;
        for (const readerId of distinct(readerIds)) {
          const key = placeKey(readerId, chatId);
          if (!places.has(key)) places.set(key, beforeNewest);
        }
      },

      findByMessageIds: async (ids) =>
        distinct(ids).flatMap((id) => {
          const message = messageById(id);
          if (!message) return [];
          const first = new Map<UserId, Date>();
          for (const { readerId, at } of marksFrom(message)) {
            if (readerId === message.senderId) continue;
            const earlier = first.get(readerId);
            if (!earlier || at < earlier) first.set(readerId, at);
          }
          return [...first].map(
            ([readerId, at]): Read => ({ messageId: id, readerId, at })
          );
        }),

      countUnread: async (readerId, chatIds) =>
        distinct(chatIds).flatMap((chatId) => {
          const count = unreadIn(chatId, readerId);
          return count ? [{ chatId, count }] : [];
        }),

      countAllUnread: async (readerIds) =>
        distinct(readerIds).flatMap((readerId) => {
          const total = [...chats.values()]
            .filter(({ chat }) => isParticipant(chat, readerId))
            .reduce((sum, { chat }) => sum + unreadIn(chat.id, readerId), 0);
          return total ? [{ readerId, total }] : [];
        }),
    },

    pushSubscriptions: {
      save: async (userId, subscription) => {
        requireUser(userId);
        pushSubscriptions.set(subscription.endpoint, { userId, subscription });
      },

      findByUserIds: async (ids) =>
        [...pushSubscriptions.values()].filter(({ userId }) =>
          ids.includes(userId)
        ),

      remove: async (endpoint, userId) => {
        if (pushSubscriptions.get(endpoint)?.userId === userId) {
          pushSubscriptions.delete(endpoint);
        }
      },
    },
  };

  const fixtures: Fixtures = {
    async user({ name, email, passwordHash = 'unusable' as PasswordHash }) {
      const user: User = {
        id: UserId(nextId()),
        email: parseEmail(email ?? fixtureEmail(name)),
        name,
        avatar: null,
      };
      users.set(user.id, { user, passwordHash });
      return user;
    },

    async groupChat(title, members) {
      members.forEach(({ id }) => requireUser(id));
      const chat: GroupChat = {
        kind: 'group',
        id: ChatId(nextId()),
        title,
        participantIds: members.map(({ id }) => id).sort(),
      };
      chats.set(chat.id, { chat, directKey: null, activeAt: new Date() });
      return chat;
    },
  };

  return { repositories, fixtures };
}

/** A message as kept: its media's sizes, without their bytes. */
function keep(id: MessageId, sent: NewMessage): Message {
  const { picture, movie, sound } = sent;
  const body = MessageBody.of(
    sent.content,
    picture && { width: picture.width, height: picture.height },
    movie && { width: movie.width, height: movie.height, frames: movie.frames },
    sound && { frames: sound.frames }
  );
  if (!body.ok) throw new Error(body.error.reason);
  return {
    id,
    chatId: sent.chatId,
    senderId: sent.senderId,
    createdAt: sent.createdAt,
    ...body.value,
  };
}

/** Earlier in its chat's history: by time, then by id, as pages are ordered. */
const isBefore = (a: Message, b: Message) =>
  (a.createdAt.getTime() - b.createdAt.getTime() || compare(a.id, b.id)) < 0;

const distinct = <T>(values: readonly T[]): T[] => [...new Set(values)];

/** Code-point order, matching Postgres' "C" collation. */
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function parseEmail(raw: string): Email {
  const email = Email.parse(raw);
  if (!email.ok) throw new Error(`Invalid fixture email: ${raw}`);
  return email.value;
}
