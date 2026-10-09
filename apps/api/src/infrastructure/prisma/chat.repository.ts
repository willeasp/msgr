import type { ChatRepository } from '../../application/ports.js';
import {
  ChatId,
  type ChannelChat,
  type ChannelName,
  type Chat,
  type DirectChat,
} from '../../domain/chat.js';
import { UserId } from '../../domain/user.js';
import { Prisma, type PrismaClient } from './client.js';

const chatFields = {
  id: true,
  directKey: true,
  title: true,
  channelName: true,
  participants: { select: { id: true }, orderBy: { id: 'asc' } },
} satisfies Prisma.ChatSelect;

type ChatRow = Prisma.ChatGetPayload<{ select: typeof chatFields }>;

export function prismaChatRepository(db: PrismaClient): ChatRepository {
  return {
    async findByIds(ids) {
      const rows = await db.chat.findMany({
        where: { id: { in: [...ids] } },
        select: chatFields,
      });
      return rows.map(toChat);
    },

    async findByParticipant(userId) {
      const rows = await db.chat.findMany({
        where: { participants: { some: { id: userId } } },
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        select: chatFields,
      });
      return rows.map(toChat);
    },

    async saveDirect({ key, participantIds }) {
      const upsert = () =>
        db.chat.upsert({
          where: { directKey: key },
          update: {},
          create: {
            directKey: key,
            participants: { connect: participantIds.map((id) => ({ id })) },
          },
          select: chatFields,
        });
      try {
        return toDirectChat(await upsert());
      } catch (error) {
        // A concurrent request created the pair's chat first; read theirs.
        if (isUniqueViolation(error)) return toDirectChat(await upsert());
        throw error;
      }
    },

    async findChannels() {
      const rows = await db.chat.findMany({
        where: { channelName: { not: null } },
        orderBy: { channelName: 'asc' },
        select: chatFields,
      });
      return rows.map(toChannel);
    },

    async joinChannel(name, userId) {
      // An empty update leaves the channel's activity alone.
      const upsert = () =>
        db.chat.upsert({
          where: { channelName: name },
          update: {},
          create: { channelName: name },
          select: { id: true },
        });
      let channel: { id: string };
      try {
        channel = await upsert();
      } catch (error) {
        // A concurrent first join created the channel; join theirs.
        if (!isUniqueViolation(error)) throw error;
        channel = await upsert();
      }
      // Joining from the user's side never touches the channel's row.
      await db.user.update({
        where: { id: userId },
        data: { chats: { connect: { id: channel.id } } },
      });
      return toChannel(
        await db.chat.findUniqueOrThrow({
          where: { id: channel.id },
          select: chatFields,
        })
      );
    },

    async leaveChannel(chatId, userId) {
      const channel = await db.chat.findFirst({
        where: { id: chatId, channelName: { not: null } },
        select: { id: true },
      });
      if (!channel) return;
      await db.user.update({
        where: { id: userId },
        data: { chats: { disconnect: { id: channel.id } } },
      });
    },
  };
}

function toChat(row: ChatRow): Chat {
  if (row.directKey !== null) return toDirectChat(row);
  if (row.channelName !== null) return toChannel(row);
  if (row.title === null) {
    throw new Error(`Chat ${row.id} is neither direct, a group nor a channel`);
  }
  return {
    kind: 'group',
    id: ChatId(row.id),
    title: row.title,
    participantIds: row.participants.map(({ id }) => UserId(id)),
  };
}

function toChannel(row: ChatRow): ChannelChat {
  if (row.channelName === null) {
    throw new Error(`Chat ${row.id} is not a channel`);
  }
  return {
    kind: 'channel',
    id: ChatId(row.id),
    name: row.channelName as ChannelName,
    participantIds: row.participants.map(({ id }) => UserId(id)),
  };
}

function toDirectChat(row: ChatRow): DirectChat {
  const [first, second, ...rest] = row.participants.map(({ id }) => UserId(id));
  if (first === undefined || second === undefined || rest.length > 0) {
    throw new Error(`Direct chat ${row.id} must have exactly two participants`);
  }
  return {
    kind: 'direct',
    id: ChatId(row.id),
    participantIds: [first, second],
  };
}

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2002';
