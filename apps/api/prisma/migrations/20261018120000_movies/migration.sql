-- Movies: 1-bit frames, 1 to 48 of them and up to 320 a side, coded by
-- `encodeMovie` from @msgr/bitmap; alongside text or instead of it, never
-- beside a picture.
ALTER TABLE "Message" ADD COLUMN "movie" BYTEA,
ADD COLUMN "movieWidth" SMALLINT,
ADD COLUMN "movieHeight" SMALLINT,
ADD COLUMN "movieFrames" SMALLINT;

ALTER TABLE "Message" DROP CONSTRAINT "Message_body_check";

ALTER TABLE "Message" ADD CONSTRAINT "Message_body_check" CHECK (
  num_nonnulls("content", "picture", "movie") >= 1
  AND num_nonnulls("picture", "movie") <= 1
  AND num_nonnulls("picture", "pictureWidth", "pictureHeight") IN (0, 3)
  AND "pictureWidth" BETWEEN 1 AND 320
  AND "pictureHeight" BETWEEN 1 AND 320
  AND num_nonnulls("movie", "movieWidth", "movieHeight", "movieFrames") IN (0, 4)
  AND "movieWidth" BETWEEN 1 AND 320
  AND "movieHeight" BETWEEN 1 AND 320
  AND "movieFrames" BETWEEN 1 AND 48
);
