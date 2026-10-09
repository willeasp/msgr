import type { MessageRepository } from '../../application/ports.js';
import { ChatId } from '../../domain/chat.js';
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
  createdAt: true,
} satisfies Prisma.MessageSelect;

type MessageRow = Prisma.MessageGetPayload<{ select: typeof messageFields }>;

export function prismaMessageRepository(db: PrismaClient): MessageRepository {
  return {
    async findPages(chatIds, { limit, offset }) {
      if (chatIds.length === 0) return [];
      // One query for every chat: rank each chat's messages newest-first and
      // keep the requested window of ranks.
      const rows = await db.$queryRaw<MessageRow[]>`
        SELECT "id", "chatId", "senderId", "content", "createdAt"
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

    async append({ chatId, senderId, content, createdAt }) {
      const [row] = await db.$transaction([
        db.message.create({
          data: { chatId, senderId, content, createdAt },
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

const toMessage = (row: MessageRow): Message => ({
  id: MessageId(row.id),
  chatId: ChatId(row.chatId),
  senderId: UserId(row.senderId),
  content: row.content as MessageContent,
  createdAt: row.createdAt,
});
