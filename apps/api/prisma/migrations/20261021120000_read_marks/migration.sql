-- CreateTable
CREATE TABLE "ReadMark" (
    "userId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReadMark_pkey" PRIMARY KEY ("userId","messageId")
);

-- CreateIndex
CREATE INDEX "ReadMark_messageId_idx" ON "ReadMark"("messageId");

-- AddForeignKey
ALTER TABLE "ReadMark" ADD CONSTRAINT "ReadMark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadMark" ADD CONSTRAINT "ReadMark_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

