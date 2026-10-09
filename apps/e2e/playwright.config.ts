import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { e2eDatabaseUrl } from './database';

const PORT = 4100;
const SITE = `http://localhost:${PORT}`;
const repo = (path: string) =>
  fileURLToPath(new URL(`../../${path}`, import.meta.url));

/**
 * Runs the production build the way it is deployed: the API serving the built
 * app from one address, in front of a database of its own that every run
 * makes afresh (prepare-database.ts). `npm run e2e` builds first.
 */
export default defineConfig({
  projects: [
    { name: 'e2e', testDir: './tests' },
    // The README's pictures, remade with `npm run screenshots`.
    { name: 'screenshots', testDir: './screenshots' },
  ],
  // One server and one database, shared: run the tests one at a time.
  workers: 1,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['github'], ['list']] : 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: SITE,
    trace: 'retain-on-failure',
  },
  webServer: {
    // Here, not in globalSetup: Playwright starts the server before globalSetup runs.
    command: `npx tsx prepare-database.ts && node ${repo(
      'apps/api/dist/main.js'
    )}`,
    url: SITE,
    // A fresh server every run, so login throttles start at zero.
    reuseExistingServer: false,
    env: {
      NODE_ENV: 'production',
      PORT: String(PORT),
      DATABASE_URL: e2eDatabaseUrl(),
      JWT_SECRET: 'e2e-only-secret-that-is-at-least-32-characters',
      CORS_ORIGIN: SITE,
      STATIC_DIR: repo('apps/frontend/dist'),
    },
  },
});
