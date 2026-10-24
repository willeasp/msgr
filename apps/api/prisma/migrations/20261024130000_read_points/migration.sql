-- DropIndex
DROP INDEX "Message_senderId_idx";

-- CreateTable
CREATE TABLE "ReadPoint" (
    "userId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,

    CONSTRAINT "ReadPoint_pkey" PRIMARY KEY ("userId","chatId")
);

-- CreateIndex
CREATE INDEX "ReadPoint_messageId_idx" ON "ReadPoint"("messageId");

-- CreateIndex
CREATE INDEX "Message_senderId_chatId_createdAt_id_idx" ON "Message"("senderId", "chatId", "createdAt", "id");

-- AddForeignKey
ALTER TABLE "ReadPoint" ADD CONSTRAINT "ReadPoint_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadPoint" ADD CONSTRAINT "ReadPoint_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadPoint" ADD CONSTRAINT "ReadPoint_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Each person's furthest mark in each chat, from the marks so far.
INSERT INTO "ReadPoint" ("userId", "chatId", "messageId")
SELECT DISTINCT ON (mark."userId", message."chatId")
    mark."userId", message."chatId", message."id"
FROM "ReadMark" AS mark
JOIN "Message" AS message ON message."id" = mark."messageId"
ORDER BY mark."userId", message."chatId", message."createdAt" DESC, message."id" DESC;

-- Before marks were kept (20261021120000_read_marks) nothing was counted
-- unread: whoever is in a chat starts after its last message from then.
INSERT INTO "ReadPoint" ("userId", "chatId", "messageId")
SELECT part."B", part."A", earlier."id"
FROM "_ChatParticipants" AS part
CROSS JOIN LATERAL (
    SELECT m."id", m."createdAt" FROM "Message" AS m
    WHERE m."chatId" = part."A"
      AND m."createdAt" < (
          SELECT "finished_at" AT TIME ZONE 'UTC' FROM "_prisma_migrations"
          WHERE "migration_name" = '20261021120000_read_marks'
      )
    ORDER BY m."createdAt" DESC, m."id" DESC
    LIMIT 1
) AS earlier
ON CONFLICT ("userId", "chatId") DO UPDATE SET "messageId" = EXCLUDED."messageId"
WHERE (
    SELECT ROW(m."createdAt", m."id") FROM "Message" AS m
    WHERE m."id" = EXCLUDED."messageId"
) > (
    SELECT ROW(m."createdAt", m."id") FROM "Message" AS m
    WHERE m."id" = "ReadPoint"."messageId"
);
