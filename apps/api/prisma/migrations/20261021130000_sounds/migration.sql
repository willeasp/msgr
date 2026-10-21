-- Sounds: 2 to 3001 frames of 20 ms, up to a minute, coded by `encodeSound`
-- from @msgr/bitmap; alongside text or instead of it, never beside a
-- picture or a movie.
ALTER TABLE "Message" ADD COLUMN "sound" BYTEA,
ADD COLUMN "soundFrames" SMALLINT;

ALTER TABLE "Message" DROP CONSTRAINT "Message_body_check";

ALTER TABLE "Message" ADD CONSTRAINT "Message_body_check" CHECK (
  num_nonnulls("content", "picture", "movie", "sound") >= 1
  AND num_nonnulls("picture", "movie", "sound") <= 1
  AND num_nonnulls("picture", "pictureWidth", "pictureHeight") IN (0, 3)
  AND "pictureWidth" BETWEEN 1 AND 320
  AND "pictureHeight" BETWEEN 1 AND 320
  AND num_nonnulls("movie", "movieWidth", "movieHeight", "movieFrames") IN (0, 4)
  AND "movieWidth" BETWEEN 1 AND 320
  AND "movieHeight" BETWEEN 1 AND 320
  AND "movieFrames" BETWEEN 1 AND 48
  AND num_nonnulls("sound", "soundFrames") IN (0, 2)
  AND "soundFrames" BETWEEN 2 AND 3001
);
