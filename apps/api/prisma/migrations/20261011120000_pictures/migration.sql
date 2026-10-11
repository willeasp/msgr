-- Drawings become pictures: any size up to 320 a side, kept as raw DEFLATE,
-- alongside text or instead of it.
ALTER TABLE "Message" ADD COLUMN "picture" BYTEA,
ADD COLUMN "pictureWidth" SMALLINT,
ADD COLUMN "pictureHeight" SMALLINT;

-- Each 256×160 drawing's 5,120 bytes, wrapped in one stored DEFLATE block:
-- final, uncompressed (01), its length (00 14 = 5120, little-endian) and that
-- length's complement (ff eb). A valid stream, made without compressing.
UPDATE "Message"
SET "picture" = '\x010014ffeb'::bytea || decode("drawing", 'base64'),
    "pictureWidth" = 256,
    "pictureHeight" = 160
WHERE "drawing" IS NOT NULL;

ALTER TABLE "Message" DROP CONSTRAINT "Message_kind_check";
ALTER TABLE "Message" DROP COLUMN "drawing";

ALTER TABLE "Message" ADD CONSTRAINT "Message_body_check" CHECK (
  num_nonnulls("content", "picture") >= 1
  AND num_nonnulls("picture", "pictureWidth", "pictureHeight") IN (0, 3)
  AND "pictureWidth" BETWEEN 1 AND 320
  AND "pictureHeight" BETWEEN 1 AND 320
);
