import type { ReadRepository } from '../../application/ports.js';
import { MessageId } from '../../domain/message.js';
import type { Read } from '../../domain/read.js';
import { UserId } from '../../domain/user.js';
import { Prisma, type PrismaClient } from './client.js';

export function prismaReadRepository(db: PrismaClient): ReadRepository {
  return {
    async markRead(message, readerId, at) {
      // Had they read this far already? A mark here or later in the chat says so.
      const further = await db.readMark.findFirst({
        where: {
          userId: readerId,
          message: {
            chatId: message.chatId,
            OR: [
              { createdAt: { gt: message.createdAt } },
              { createdAt: message.createdAt, id: { gte: message.id } },
            ],
          },
        },
        select: { messageId: true },
      });
      if (further) return;
      // Two at once leave two marks, which say the same.
      await db.readMark.createMany({
        data: [{ userId: readerId, messageId: message.id, readAt: at }],
        skipDuplicates: true,
      });
    },

    async findByMessageIds(ids) {
      if (ids.length === 0) return [];
      // Each message was first read at the earliest mark on it or after it.
      const rows = await db.$queryRaw<
        { messageId: string; readerId: string; at: Date }[]
      >`
        SELECT m."id" AS "messageId", r."userId" AS "readerId",
          MIN(r."readAt") AS "at"
        FROM "Message" m
        JOIN "Message" seen ON seen."chatId" = m."chatId"
          AND (seen."createdAt", seen."id") >= (m."createdAt", m."id")
        JOIN "ReadMark" r ON r."messageId" = seen."id"
        WHERE m."id" IN (${Prisma.join(ids)}) AND r."userId" <> m."senderId"
        GROUP BY m."id", r."userId"`;
      return rows.map(
        ({ messageId, readerId, at }): Read => ({
          messageId: MessageId(messageId),
          readerId: UserId(readerId),
          at,
        })
      );
    },
  };
}
