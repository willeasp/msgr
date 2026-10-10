import type { Repositories } from '../application/ports.js';
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
import { MessageId, type Message } from '../domain/message.js';
import type { PushSubscription } from '../domain/push.js';
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
        const user: User = { id: UserId(nextId()), email, name };
        users.set(user.id, { user, passwordHash });
        invites.set(code, { ...record, used: true });
        return ok({ user, invitedBy: record.invite.invitedBy });
      },
    },

    messages: {
      findByIds: async (ids) =>
        messages.filter((message) => ids.includes(message.id)),

      findPages: async (chatIds, { limit, offset }) =>
        distinct(chatIds).flatMap((chatId) =>
          messages
            .filter((message) => message.chatId === chatId)
            .sort(
              (a, b) =>
                b.createdAt.getTime() - a.createdAt.getTime() ||
                compare(b.id, a.id)
            )
            .slice(offset, offset + limit)
            .reverse()
        ),

      append: async (input) => {
        const record = chats.get(input.chatId);
        if (!record) throw new Error(`Unknown chat ${input.chatId}`);
        requireUser(input.senderId);
        const message: Message = { id: MessageId(nextId()), ...input };
        messages.push(message);
        record.activeAt = input.createdAt;
        return message;
      },
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

const distinct = <T>(values: readonly T[]): T[] => [...new Set(values)];

/** Code-point order, matching Postgres' "C" collation. */
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function parseEmail(raw: string): Email {
  const email = Email.parse(raw);
  if (!email.ok) throw new Error(`Invalid fixture email: ${raw}`);
  return email.value;
}
