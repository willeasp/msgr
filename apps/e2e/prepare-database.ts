import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { E2E_DATABASE, e2eDatabaseUrl, postgresServerUrl } from './database';

/** Makes the run's database from nothing: all migrations, then the seed data. */
const prisma = (args: string[], sql?: string) =>
  execFileSync('npx', ['prisma', ...args], {
    cwd: fileURLToPath(new URL('../api', import.meta.url)),
    env: { ...process.env, DATABASE_URL: e2eDatabaseUrl() },
    input: sql,
    stdio: [sql === undefined ? 'inherit' : 'pipe', 'inherit', 'inherit'],
  });

// One statement per call: Postgres can't drop or create a database inside a transaction.
const onServer = ['db', 'execute', '--url', postgresServerUrl(), '--stdin'];
prisma(onServer, `DROP DATABASE IF EXISTS ${E2E_DATABASE} WITH (FORCE)`);
prisma(onServer, `CREATE DATABASE ${E2E_DATABASE}`);
prisma(['migrate', 'deploy']);
prisma(['db', 'seed']);
