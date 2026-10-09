-- DropIndex
DROP INDEX "Message_chatId_idx";

-- AlterTable
ALTER TABLE "Chat" ADD COLUMN     "directKey" TEXT,
ALTER COLUMN "title" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Chat_directKey_key" ON "Chat"("directKey");

-- CreateIndex
CREATE INDEX "Message_chatId_createdAt_id_idx" ON "Message"("chatId", "createdAt", "id");

-- Backfill: every two-person chat becomes its pair's direct chat. Where earlier
-- code created duplicates for one pair, the oldest wins and the rest stay
-- titled group chats.
UPDATE "Chat" AS c
SET "directKey" = pairs."key", "title" = NULL
FROM (
  SELECT DISTINCT ON ("key") "chatId", "key"
  FROM (
    SELECT p."A" AS "chatId", string_agg(p."B", ':' ORDER BY p."B") AS "key"
    FROM "_ChatParticipants" AS p
    GROUP BY p."A"
    HAVING count(*) = 2
  ) AS candidates
  JOIN "Chat" AS chat ON chat."id" = candidates."chatId"
  ORDER BY "key", chat."createdAt", chat."id"
) AS pairs
WHERE c."id" = pairs."chatId";

-- A chat is either direct (keyed, untitled) or a group (titled, unkeyed).
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_direct_xor_group_check"
  CHECK (("directKey" IS NULL) <> ("title" IS NULL));
