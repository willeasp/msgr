import type { ReadRepository } from '../../application/ports.js';
import { ChatId } from '../../domain/chat.js';
import { MessageId } from '../../domain/message.js';
import type { Read, Unread, UnreadTotal } from '../../domain/read.js';
import { UserId } from '../../domain/user.js';
import { Prisma, type PrismaClient } from './client.js';

export function prismaReadRepository(db: PrismaClient): ReadRepository {
  return {
    async markRead(message, readerId, at) {
      // Their point in the chat moves only forward: unchanged, they had
      // already read this far, and there's nothing to mark.
      const moved = await db.$executeRaw`
        INSERT INTO "ReadPoint" ("userId", "chatId", "messageId")
        VALUES (${readerId}, ${message.chatId}, ${message.id})
        ON CONFLICT ("userId", "chatId") DO UPDATE
          SET "messageId" = EXCLUDED."messageId"
          WHERE ${position(Prisma.sql`EXCLUDED."messageId"`)}
            > ${position(Prisma.sql`"ReadPoint"."messageId"`)}`;
      if (moved === 0) return;
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

    async countUnread(readerId, chatIds) {
      if (chatIds.length === 0) return [];
      const rows = await db.$queryRaw<{ chatId: string; count: number }[]>`
        SELECT chat.id AS "chatId", unread.count
        FROM (
          SELECT DISTINCT unnest(ARRAY[${Prisma.join(chatIds)}]::text[]) AS id
        ) AS chat
        ${unreadOf(Prisma.sql`chat.id`, Prisma.sql`${readerId}`)}
        WHERE unread.count > 0`;
      return rows.map(
        ({ chatId, count }): Unread => ({ chatId: ChatId(chatId), count })
      );
    },

    async countAllUnread(readerIds) {
      if (readerIds.length === 0) return [];
      // "A" is the chat and "B" the person in Prisma's join table.
      const rows = await db.$queryRaw<{ readerId: string; total: number }[]>`
        SELECT part."B" AS "readerId", SUM(unread.count)::int AS total
        FROM "_ChatParticipants" AS part
        ${unreadOf(Prisma.sql`part."A"`, Prisma.sql`part."B"`)}
        WHERE part."B" IN (${Prisma.join(readerIds)})
        GROUP BY part."B"
        HAVING SUM(unread.count) > 0`;
      return rows.map(
        ({ readerId, total }): UnreadTotal => ({
          readerId: UserId(readerId),
          total,
        })
      );
    },
  };
}

/** Where a message sits in its chat, as pages order it: (createdAt, id). */
const position = (messageId: Prisma.Sql) => Prisma.sql`
  (SELECT ROW(m."createdAt", m."id") FROM "Message" m WHERE m."id" = ${messageId})`;

/**
 * Joins `unread.count`: how many messages others sent in `chat` after the
 * later of the last one `reader` read (their ReadPoint) and the last they
 * sent (the end of their run in the sender index). The count walks the
 * chat's (chatId, createdAt, id) index from there, so it costs only what's
 * unread.
 */
const unreadOf = (chat: Prisma.Sql, reader: Prisma.Sql) => Prisma.sql`
  LEFT JOIN "ReadPoint" AS point
    ON point."userId" = ${reader} AND point."chatId" = ${chat}
  LEFT JOIN "Message" AS reached ON reached."id" = point."messageId"
  LEFT JOIN LATERAL (
    SELECT own."createdAt", own."id" FROM "Message" own
    WHERE own."senderId" = ${reader} AND own."chatId" = ${chat}
    ORDER BY own."createdAt" DESC, own."id" DESC
    LIMIT 1
  ) AS sent ON true
  CROSS JOIN LATERAL (
    SELECT p."createdAt", p."id"
    FROM (VALUES (reached."createdAt", reached."id"), (sent."createdAt", sent."id"))
      AS p ("createdAt", "id")
    ORDER BY p."createdAt" DESC NULLS LAST, p."id" DESC NULLS LAST
    LIMIT 1
  ) AS seen
  CROSS JOIN LATERAL (
    SELECT COUNT(*)::int AS count FROM "Message" m
    WHERE m."chatId" = ${chat} AND m."senderId" <> ${reader}
      AND (m."createdAt", m."id")
        > (COALESCE(seen."createdAt", '-infinity'), COALESCE(seen."id", ''))
  ) AS unread`;
