import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import type { PrismaClient } from './client.js';

/**
 * The migrations in `dir` the database hasn't finished applying, oldest first
 * (every one, for a database never migrated), and any the database holds
 * half-done, even one this release doesn't know. One query, so a server can
 * tell in milliseconds that it's up to date, which is nearly every time it
 * starts; anything else sends `migrate` to the Prisma CLI, which applies what's
 * new and refuses a half-done migration, as it always has.
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
  const rows = await db.$queryRaw<
    { name: string; finished: boolean; rolledBack: boolean }[]
  >`
    SELECT migration_name AS "name",
      finished_at IS NOT NULL AS "finished",
      rolled_back_at IS NOT NULL AS "rolledBack"
    FROM _prisma_migrations`;
  const done = new Set(
    rows.filter((row) => row.finished && !row.rolledBack).map((row) => row.name)
  );
  const halfDone = rows
    .filter((row) => !row.finished && !row.rolledBack)
    .map((row) => row.name);
  return [
    ...new Set([...local.filter((name) => !done.has(name)), ...halfDone]),
  ].sort();
}

/**
 * Brings the database up to date and returns what it applied. The Prisma CLI
 * takes seconds just to start, so it runs only when something is pending.
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
