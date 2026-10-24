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
