-- AlterTable
ALTER TABLE "Message" ALTER COLUMN "content" DROP NOT NULL,
ADD COLUMN     "drawing" TEXT;

-- A message is exactly one of: text or a drawing.
ALTER TABLE "Message" ADD CONSTRAINT "Message_kind_check"
  CHECK (num_nonnulls("content", "drawing") = 1);
