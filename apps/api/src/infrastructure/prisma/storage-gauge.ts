import type { StorageGauge } from '../../application/ports.js';
import type { ContentKind } from '../../domain/storage.js';
import type { PrismaClient } from './client.js';

/** Postgres counts in bigints, which never get near 2^53 here. */
type Counted<Keys extends string> = Record<Keys, bigint>;

/**
 * Asks Postgres itself. Content is measured as stored (`pg_column_size`:
 * after any compression), so it adds up to part of its table's size.
 */
export function prismaStorageGauge(db: PrismaClient): StorageGauge {
  return {
    async measure() {
      const [[database], tables, [messages], [users]] = await Promise.all([
        db.$queryRaw<Counted<'bytes'>[]>`
          SELECT pg_database_size(current_database()) AS bytes`,
        db.$queryRaw<(Counted<'bytes'> & { name: string })[]>`
          SELECT relname AS name, pg_total_relation_size(relid) AS bytes
          FROM pg_catalog.pg_statio_user_tables`,
        db.$queryRaw<
          Counted<`${'text' | 'picture' | 'movie' | 'sound'}${'s' | 'Bytes'}`>[]
        >`
          SELECT
            count(content) AS texts,
            coalesce(sum(pg_column_size(content)), 0)::bigint AS "textBytes",
            count(picture) AS pictures,
            coalesce(sum(pg_column_size(picture)), 0)::bigint AS "pictureBytes",
            count(movie) AS movies,
            coalesce(sum(pg_column_size(movie)), 0)::bigint AS "movieBytes",
            count(sound) AS sounds,
            coalesce(sum(pg_column_size(sound)), 0)::bigint AS "soundBytes"
          FROM "Message"`,
        db.$queryRaw<Counted<'avatars' | 'avatarBytes'>[]>`
          SELECT
            count(avatar) AS avatars,
            coalesce(sum(pg_column_size(avatar)), 0)::bigint AS "avatarBytes"
          FROM "User"`,
      ]);
      const counts = { ...messages, ...users } as Record<string, bigint>;
      const kinds: ContentKind[] = [
        'text',
        'picture',
        'movie',
        'sound',
        'avatar',
      ];
      return {
        databaseBytes: Number(database?.bytes ?? 0),
        tables: tables.map(({ name, bytes }) => ({
          name,
          bytes: Number(bytes),
        })),
        contents: kinds.map((kind) => ({
          kind,
          count: Number(counts[`${kind}s`] ?? 0),
          bytes: Number(counts[`${kind}Bytes`] ?? 0),
        })),
      };
    },
  };
}
