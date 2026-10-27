-- Uploads: a message's picture, movie or sound, put by its sender ahead of
-- the message (ADR 0018), under the id the message will have, until the
-- message takes it.
CREATE TABLE "Upload" (
    "id" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "picture" BYTEA,
    "pictureWidth" SMALLINT,
    "pictureHeight" SMALLINT,
    "movie" BYTEA,
    "movieWidth" SMALLINT,
    "movieHeight" SMALLINT,
    "movieFrames" SMALLINT,
    "sound" BYTEA,
    "soundFrames" SMALLINT,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Upload_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Upload_createdAt_idx" ON "Upload"("createdAt");

ALTER TABLE "Upload" ADD CONSTRAINT "Upload_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Exactly one of a picture, a movie and a sound, with its size, as a
-- message's (Message_body_check).
ALTER TABLE "Upload" ADD CONSTRAINT "Upload_media_check" CHECK (
  num_nonnulls("picture", "movie", "sound") = 1
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
