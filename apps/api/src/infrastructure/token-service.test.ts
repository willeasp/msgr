import { afterEach, describe, expect, it, vi } from 'vitest';
import { UserId } from '../domain/user.js';
import { createJwtTokenService } from './token-service.js';

const tokens = createJwtTokenService({
  secret: 'a-secret-long-enough-for-hs256-signing',
  ttlSeconds: 60,
});

afterEach(() => {
  vi.useRealTimers();
});

describe('JWT token service', () => {
  it('round-trips the user id', async () => {
    const token = await tokens.issue(UserId('ada'));

    expect(await tokens.verify(token)).toBe('ada');
  });

  it('rejects an expired token', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const token = await tokens.issue(UserId('ada'));

    vi.advanceTimersByTime(61_000);

    expect(await tokens.verify(token)).toBeNull();
  });

  it('rejects a token signed with "none"', async () => {
    const header = Buffer.from('{"alg":"none"}').toString('base64url');
    const payload = Buffer.from('{"sub":"ada"}').toString('base64url');

    expect(await tokens.verify(`${header}.${payload}.`)).toBeNull();
  });
});
