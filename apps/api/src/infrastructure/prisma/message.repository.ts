import type { MessageRepository } from '../../application/ports.js';
import { ChatId } from '../../domain/chat.js';
import type { Drawing } from '../../domain/drawing.js';
import {
  MessageId,
  type Message,
  type MessageContent,
} from '../../domain/message.js';
import { UserId } from '../../domain/user.js';
import { Prisma, type PrismaClient } from './client.js';

const messageFields = {
  id: true,
  chatId: true,
  senderId: true,
  content: true,
  drawing: true,
  createdAt: true,
} satisfies Prisma.MessageSelect;

type MessageRow = Prisma.MessageGetPayload<{ select: typeof messageFields }>;

export function prismaMessageRepository(db: PrismaClient): MessageRepository {
  return {
    async findByIds(ids) {
      const rows = await db.message.findMany({
        where: { id: { in: [...ids] } },
        select: messageFields,
      });
      return rows.map(toMessage);
    },

    async findPages(chatIds, { limit, offset }) {
      if (chatIds.length === 0) return [];
      // One query for every chat: rank each chat's messages newest-first and
      // keep the requested window of ranks.
      const rows = await db.$queryRaw<MessageRow[]>`
        SELECT "id", "chatId", "senderId", "content", "drawing", "createdAt"
        FROM (
          SELECT *, ROW_NUMBER() OVER (
            PARTITION BY "chatId" ORDER BY "createdAt" DESC, "id" DESC
          ) AS "rank"
          FROM "Message"
          WHERE "chatId" IN (${Prisma.join(chatIds)})
        ) AS ranked
        WHERE "rank" > ${offset} AND "rank" <= ${offset + limit}
        ORDER BY "chatId", "createdAt", "id"`;
      return rows.map(toMessage);
    },

    async append(message) {
      const { chatId, senderId, createdAt } = message;
      const body =
        message.kind === 'text'
          ? { content: message.content }
          : { drawing: message.drawing };
      const [row] = await db.$transaction([
        db.message.create({
          data: { chatId, senderId, createdAt, ...body },
          select: messageFields,
        }),
        db.chat.update({
          where: { id: chatId },
          data: { updatedAt: createdAt },
          select: { id: true },
        }),
      ]);
      return toMessage(row);
    },
  };
}

function toMessage(row: MessageRow): Message {
  const sent = {
    id: MessageId(row.id),
    chatId: ChatId(row.chatId),
    senderId: UserId(row.senderId),
    createdAt: row.createdAt,
  };
  if (row.content !== null) {
    return { ...sent, kind: 'text', content: row.content as MessageContent };
  }
  if (row.drawing !== null) {
    return { ...sent, kind: 'drawing', drawing: row.drawing as Drawing };
  }
  throw new Error(`Message ${row.id} has neither text nor a drawing`);
}
