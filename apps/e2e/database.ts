/** The database each run creates afresh. Nothing else on the server is touched. */
export const E2E_DATABASE = 'msgr_e2e';

/**
 * A Postgres server to make that database in, as a URL to any database on it.
 * Defaults to the test container from CLAUDE.md, which the Postgres contract
 * tests share.
 */
export function postgresServerUrl(): string {
  const url =
    process.env['E2E_POSTGRES_URL'] ??
    'postgresql://postgres:postgres@localhost:55432/postgres';
  if (!url.startsWith('postgres')) {
    throw new Error(
      'E2E_POSTGRES_URL must be a postgres:// URL to a real Postgres server. Prisma dev (prisma+postgres://) holds a single database, the one you develop with.'
    );
  }
  return url;
}

export function e2eDatabaseUrl(): string {
  const url = new URL(postgresServerUrl());
  url.pathname = `/${E2E_DATABASE}`;
  return url.toString();
}
