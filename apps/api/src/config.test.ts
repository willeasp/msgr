import { describe, expect, it } from 'vitest';
import { parseConfig } from './config.js';

const production = {
  NODE_ENV: 'production',
  JWT_SECRET: 's'.repeat(32),
  CORS_ORIGIN: 'https://msgr.example',
};

describe('parseConfig', () => {
  it('runs locally with no configuration at all', () => {
    expect(parseConfig({})).toMatchObject({
      ok: true,
      value: {
        port: 4000,
        corsOrigin: 'http://localhost:4200',
        secureCookies: false,
      },
    });
  });

  it('refuses to start in production without a real JWT secret or its public address', () => {
    expect(parseConfig({ NODE_ENV: 'production' })).toEqual({
      ok: false,
      error: [
        'JWT_SECRET must be at least 32 characters and is required in production',
        'CORS_ORIGIN, the address people open the app at, is required in production',
      ],
    });
  });

  it('uses secure cookies in production', () => {
    expect(parseConfig(production)).toMatchObject({
      ok: true,
      value: { secureCookies: true, corsOrigin: 'https://msgr.example' },
    });
  });

  it('on Render, defaults to the public address Render gives the service', () => {
    expect(
      parseConfig({
        NODE_ENV: 'production',
        JWT_SECRET: 's'.repeat(32),
        RENDER_EXTERNAL_URL: 'https://msgr-xyz.onrender.com',
      })
    ).toMatchObject({
      ok: true,
      value: { corsOrigin: 'https://msgr-xyz.onrender.com' },
    });
  });

  it('keeps people signed in for 30 days', () => {
    expect(parseConfig({})).toMatchObject({
      ok: true,
      value: { sessionTtlSeconds: 30 * 24 * 60 * 60 },
    });
  });

  it('serves the built app only when STATIC_DIR is set', () => {
    expect(parseConfig({})).toMatchObject({ value: { staticDir: null } });
    expect(parseConfig({ STATIC_DIR: '/app/public' })).toMatchObject({
      value: { staticDir: '/app/public' },
    });
  });

  it('pushes with the development keys locally, signed as the app’s address', () => {
    const config = parseConfig({});
    expect(config.ok && config.value.push).toMatchObject({
      publicKey: expect.stringMatching(/^B[A-Za-z0-9_-]{86}$/),
      subject: 'http://localhost:4200',
    });
  });

  it('runs with push off in production until both VAPID keys are set', () => {
    expect(parseConfig(production)).toMatchObject({
      ok: true,
      value: { push: null },
    });
    expect(
      parseConfig({
        ...production,
        VAPID_PUBLIC_KEY: `B${'a'.repeat(86)}`,
        VAPID_PRIVATE_KEY: 'p'.repeat(43),
      })
    ).toMatchObject({
      ok: true,
      value: {
        push: {
          publicKey: `B${'a'.repeat(86)}`,
          privateKey: 'p'.repeat(43),
          subject: 'https://msgr.example',
        },
      },
    });
  });

  it('refuses one VAPID key without the other, or keys that are not base64url', () => {
    expect(
      parseConfig({ ...production, VAPID_PUBLIC_KEY: `B${'a'.repeat(86)}` })
    ).toEqual({
      ok: false,
      error: [
        'VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY go together: set both, or neither to turn push off',
      ],
    });
    expect(
      parseConfig({
        ...production,
        VAPID_PUBLIC_KEY: 'not a key',
        VAPID_PRIVATE_KEY: 'p'.repeat(43),
      })
    ).toEqual({
      ok: false,
      error: [
        'VAPID keys must be base64url, as `npx web-push generate-vapid-keys` prints them',
      ],
    });
  });

  it('reports every problem at once', () => {
    expect(parseConfig({ PORT: 'eighty', JWT_SECRET: 'short' })).toMatchObject({
      ok: false,
      error: [
        expect.stringContaining('PORT'),
        expect.stringContaining('JWT_SECRET'),
      ],
    });
  });
});
