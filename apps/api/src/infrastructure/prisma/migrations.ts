import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import type { PrismaClient } from './client.js';

/**
 * The migrations in `dir` the database hasn't finished applying, oldest first:
 * every one, for a database never migrated. One query, so a server can tell in
 * milliseconds that it's up to date, which is nearly every time it starts.
 */
export async function pendingMigrations(
  db: PrismaClient,
  dir: string
): Promise<string[]> {
  const local = (await readdir(dir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const [table] = await db.$queryRaw<{ exists: boolean }[]>`
    SELECT to_regclass('_prisma_migrations') IS NOT NULL AS "exists"`;
  if (!table?.exists) return local;
  const applied = await db.$queryRaw<{ migration_name: string }[]>`
    SELECT migration_name FROM _prisma_migrations
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
  const done = new Set(applied.map((row) => row.migration_name));
  return local.filter((name) => !done.has(name));
}

/**
 * Brings the database up to date and returns what it applied. The Prisma CLI
 * takes seconds just to start, so it runs only when something is pending; it
 * then also refuses a migration that failed half-way, as it always has.
 */
export async function migrate(
  db: PrismaClient,
  { dir, schema }: { dir: string; schema: string }
): Promise<string[]> {
  const pending = await pendingMigrations(db, dir);
  if (pending.length === 0) return pending;
  await new Promise<void>((done, fail) =>
    spawn('npx', ['prisma', 'migrate', 'deploy', '--schema', schema], {
      stdio: 'inherit',
    })
      .on('error', fail)
      .on('exit', (code) =>
        code === 0
          ? done()
          : fail(new Error(`prisma migrate deploy exited with ${code}`))
      )
  );
  return pending;
}
