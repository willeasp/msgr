import type { ChatRepository } from '../../application/ports.js';
import { ChatId, type Chat, type DirectChat } from '../../domain/chat.js';
import { UserId } from '../../domain/user.js';
import { Prisma, type PrismaClient } from './client.js';

const chatFields = {
  id: true,
  directKey: true,
  title: true,
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
  };
}

function toChat(row: ChatRow): Chat {
  if (row.directKey !== null) return toDirectChat(row);
  if (row.title === null) {
    throw new Error(`Chat ${row.id} has neither a direct key nor a title`);
  }
  return {
    kind: 'group',
    id: ChatId(row.id),
    title: row.title,
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
