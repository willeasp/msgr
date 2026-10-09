-- AlterTable
ALTER TABLE "Chat" ADD COLUMN     "channelName" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Chat_channelName_key" ON "Chat"("channelName");


-- A chat is exactly one of: direct (keyed), group (titled) or channel (named).
ALTER TABLE "Chat" DROP CONSTRAINT "Chat_direct_xor_group_check";
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_kind_check"
  CHECK (num_nonnulls("directKey", "title", "channelName") = 1);
