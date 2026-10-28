import type { UploadRepository } from '../../application/ports.js';
import { MessageId } from '../../domain/message.js';
import type { Movie } from '../../domain/movie.js';
import type { Picture } from '../../domain/picture.js';
import type { Sound } from '../../domain/sound.js';
import type { Upload } from '../../domain/upload.js';
import { UserId } from '../../domain/user.js';
import type { Prisma, PrismaClient } from './client.js';

type UploadRow = Prisma.UploadGetPayload<object>;

/** The columns a message's or an upload's picture, movie or sound fills. */
export const mediaColumns = ({
  picture,
  movie,
  sound,
}: {
  readonly picture: Picture | null;
  readonly movie: Movie | null;
  readonly sound: Sound | null;
}) => ({
  picture: picture?.deflated ?? null,
  pictureWidth: picture?.width ?? null,
  pictureHeight: picture?.height ?? null,
  movie: movie?.coded ?? null,
  movieWidth: movie?.width ?? null,
  movieHeight: movie?.height ?? null,
  movieFrames: movie?.frames ?? null,
  sound: sound?.coded ?? null,
  soundFrames: sound?.frames ?? null,
});

export function prismaUploadRepository(db: PrismaClient): UploadRepository {
  return {
    async put(upload) {
      const { id, uploaderId, createdAt } = upload;
      const media = mediaColumns(upload);
      // Replaces only its uploader's own: another's keeps the id, and
      // nothing comes back. Its time is UTC whatever the session's zone,
      // as Prisma writes it everywhere else.
      const kept = await db.$queryRaw<{ id: string }[]>`
        INSERT INTO "Upload" (
          "id", "uploaderId", "createdAt",
          "picture", "pictureWidth", "pictureHeight",
          "movie", "movieWidth", "movieHeight", "movieFrames",
          "sound", "soundFrames"
        ) VALUES (
          ${id}, ${uploaderId},
          ${createdAt.toISOString()}::timestamptz AT TIME ZONE 'UTC',
          ${media.picture}, ${media.pictureWidth}::smallint, ${
        media.pictureHeight
      }::smallint,
          ${media.movie}, ${media.movieWidth}::smallint, ${
        media.movieHeight
      }::smallint, ${media.movieFrames}::smallint,
          ${media.sound}, ${media.soundFrames}::smallint
        )
        ON CONFLICT ("id") DO UPDATE SET
          "createdAt" = EXCLUDED."createdAt",
          "picture" = EXCLUDED."picture",
          "pictureWidth" = EXCLUDED."pictureWidth",
          "pictureHeight" = EXCLUDED."pictureHeight",
          "movie" = EXCLUDED."movie",
          "movieWidth" = EXCLUDED."movieWidth",
          "movieHeight" = EXCLUDED."movieHeight",
          "movieFrames" = EXCLUDED."movieFrames",
          "sound" = EXCLUDED."sound",
          "soundFrames" = EXCLUDED."soundFrames"
        WHERE "Upload"."uploaderId" = EXCLUDED."uploaderId"
        RETURNING "id"`;
      return kept.length > 0;
    },

    async findByIds(ids) {
      const rows = await db.upload.findMany({
        where: { id: { in: [...ids] } },
      });
      return rows.map(toUpload);
    },

    async forget(at, uploaderId, keep) {
      await db.$executeRaw`
        DELETE FROM "Upload"
        WHERE "createdAt" < ${at.toISOString()}::timestamptz AT TIME ZONE 'UTC'
          OR "id" IN (
            SELECT "id" FROM "Upload"
            WHERE "uploaderId" = ${uploaderId}
            ORDER BY "createdAt" DESC, "id" DESC
            OFFSET ${keep}
          )`;
    },
  };
}

// Checked when it was put: exactly one part is set, with its size (CHECK).
function toUpload(row: UploadRow): Upload {
  const kept = {
    id: MessageId(row.id),
    uploaderId: UserId(row.uploaderId),
    createdAt: row.createdAt,
  };
  const none = { picture: null, movie: null, sound: null };
  if (row.picture && row.pictureWidth && row.pictureHeight) {
    const picture = {
      width: row.pictureWidth,
      height: row.pictureHeight,
      deflated: new Uint8Array(row.picture),
    } as Picture;
    return { ...kept, ...none, picture };
  }
  if (row.movie && row.movieWidth && row.movieHeight && row.movieFrames) {
    const movie = {
      width: row.movieWidth,
      height: row.movieHeight,
      frames: row.movieFrames,
      coded: new Uint8Array(row.movie),
    } as Movie;
    return { ...kept, ...none, movie };
  }
  if (row.sound && row.soundFrames) {
    const sound = {
      frames: row.soundFrames,
      coded: new Uint8Array(row.sound),
    } as Sound;
    return { ...kept, ...none, sound };
  }
  throw new Error(`Upload ${row.id} breaks its CHECK`);
}
