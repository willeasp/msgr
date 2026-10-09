import { describe, expect, it } from 'vitest';
import { parseConfig } from './config.js';

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

  it('refuses to start in production without a real JWT secret', () => {
    expect(parseConfig({ NODE_ENV: 'production' })).toEqual({
      ok: false,
      error: [
        'JWT_SECRET must be at least 32 characters and is required in production',
      ],
    });
  });

  it('uses secure cookies in production', () => {
    expect(
      parseConfig({ NODE_ENV: 'production', JWT_SECRET: 's'.repeat(32) })
    ).toMatchObject({ ok: true, value: { secureCookies: true } });
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
