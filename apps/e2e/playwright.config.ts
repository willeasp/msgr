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
    // A phone's layout (ADR 0013), on two phones' screens, in Chromium.
    { name: 'pixel', testDir: './phone', use: { ...devices['Pixel 7'] } },
    {
      name: 'iphone',
      testDir: './phone',
      use: { ...devices['iPhone 15'], browserName: 'chromium' },
    },
    // The README's pictures, remade with `npm run screenshots`.
    { name: 'screenshots', testDir: './screenshots' },
    // What the app costs to use, printed by `npm run measure`.
    { name: 'measure', testDir: './measure' },
  ],
  // One server and one database, shared: run the tests one at a time.
  workers: 1,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['github'], ['list']] : 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: SITE,
    // A pretend microphone that beeps, granted without asking, for sounds.
    launchOptions: {
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
      ],
    },
    trace: 'retain-on-failure',
    // Every browser starts with the notifications offer dismissed, so it stays
    // out of the way; notifications.spec.ts makes browsers without it.
    storageState: {
      cookies: [],
      origins: [
        {
          origin: SITE,
          localStorage: [{ name: 'notifications-dismissed', value: 'true' }],
        },
      ],
    },
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
      // Development's pair (apps/api/src/config.ts), so push is on.
      VAPID_PUBLIC_KEY:
        'BHdgRT9dGCZv-REtiHJtRv-vcQMexFE3rhRYq5_8EIqBR2zDLtUJ2SVOz2LBEq8Lone3iCmqO_W-uHT5C6eDLJ8',
      VAPID_PRIVATE_KEY: 'Sy7TpkdTQnDIi_pqCnRTZegtIR265nJb2gFLqGF16kw',
      // The seed's Erin, whom no other spec signs in as.
      ADMIN_EMAILS: 'erin@example.com',
      STORAGE_LIMIT_MB: '512',
    },
  },
});
