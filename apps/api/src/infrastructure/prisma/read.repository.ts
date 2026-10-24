import type { ReadRepository } from '../../application/ports.js';
import { ChatId } from '../../domain/chat.js';
import { MessageId } from '../../domain/message.js';
import {
  UNREAD_LIMIT,
  type Read,
  type Unread,
  type UnreadTotal,
} from '../../domain/read.js';
import { UserId } from '../../domain/user.js';
import { Prisma, type PrismaClient } from './client.js';

export function prismaReadRepository(db: PrismaClient): ReadRepository {
  return {
    async markRead(message, readerId, at) {
      // Their place in the chat moves only forward, and a mark is kept only
      // when it does: had they read this far already, nothing changes. One
      // statement, so the place and the marks never disagree.
      await db.$executeRaw`
        WITH moved AS (
          INSERT INTO "ReadPoint" ("userId", "chatId", "messageId")
          VALUES (${readerId}, ${message.chatId}, ${message.id})
          ON CONFLICT ("userId", "chatId") DO UPDATE
            SET "messageId" = EXCLUDED."messageId"
            WHERE ${position(Prisma.sql`EXCLUDED."messageId"`)}
              > ${position(Prisma.sql`"ReadPoint"."messageId"`)}
          RETURNING "messageId"
        )
        INSERT INTO "ReadMark" ("userId", "messageId", "readAt")
        SELECT ${readerId}, moved."messageId",
          ${at.toISOString()}::timestamptz AT TIME ZONE 'UTC'
        FROM moved
        ON CONFLICT DO NOTHING`;
    },

    async startReading(chatId, readerIds) {
      if (readerIds.length === 0) return;
      await db.$executeRaw`
        INSERT INTO "ReadPoint" ("userId", "chatId", "messageId")
        SELECT reader.id, ${chatId}, before_newest."id"
        FROM (
          SELECT DISTINCT unnest(ARRAY[${Prisma.join(readerIds)}]::text[]) AS id
        ) AS reader
        CROSS JOIN (
          SELECT "id" FROM "Message" WHERE "chatId" = ${chatId}
          ORDER BY "createdAt" DESC, "id" DESC
          LIMIT 1 OFFSET 1
        ) AS before_newest
        ON CONFLICT ("userId", "chatId") DO NOTHING`;
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
 * sent (the end of their run in the sender index), up to UNREAD_LIMIT. The
 * count walks the chat's (chatId, createdAt, id) index from there, so it
 * costs no more than what it counts.
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
    -- All of it is someone else's: their own last is at or before seen.
    SELECT COUNT(*)::int AS count FROM (
      SELECT 1 FROM "Message" m
      WHERE m."chatId" = ${chat}
        AND (m."createdAt", m."id")
          > (COALESCE(seen."createdAt", '-infinity'), COALESCE(seen."id", ''))
      LIMIT ${UNREAD_LIMIT}
    ) AS counted
  ) AS unread`;
