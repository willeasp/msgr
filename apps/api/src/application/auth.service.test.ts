import { describe, expect, it, vi } from 'vitest';
import { UserId } from '../domain/user.js';
import { createJwtTokenService } from '../infrastructure/token-service.js';
import {
  createTestApp,
  expectOk,
  fakeHash,
  fakePasswordHasher,
} from '../testing/harness.js';

async function appWithAda() {
  const app = createTestApp();
  const ada = await app.fixtures.user({
    name: 'Ada',
    email: 'ada@example.com',
    passwordHash: fakeHash('correct horse'),
  });
  return { ...app, ada };
}

describe('login', () => {
  it('issues a token that authenticates the user', async () => {
    const { services, ada } = await appWithAda();

    const session = expectOk(
      await services().auth.login({
        email: '  ADA@example.com ',
        password: 'correct horse',
      })
    );

    expect(session.user).toEqual(ada);
    expect(await services().auth.authenticate(session.token)).toEqual(ada);
  });

  it.each([
    ['a wrong password', 'ada@example.com', 'battery staple'],
    ['an unknown email', 'nobody@example.com', 'correct horse'],
    ['a malformed email', 'ada', 'correct horse'],
  ])(
    'rejects %s without saying which part was wrong',
    async (_, email, password) => {
      const { services } = await appWithAda();

      expect(await services().auth.login({ email, password })).toEqual({
        ok: false,
        error: { type: 'InvalidCredentials' },
      });
    }
  );

  it('still checks a password when the email is unknown, so timing reveals nothing', async () => {
    const verify = vi.fn(fakePasswordHasher.verify);
    const { services } = createTestApp({ passwords: { verify } });

    await services().auth.login({ email: 'nobody@example.com', password: 'x' });

    expect(verify).toHaveBeenCalledWith('x', null);
  });
});

describe('authenticate', () => {
  it('treats a missing, malformed, foreign or orphaned token as anonymous', async () => {
    const { services, deps } = await appWithAda();
    const foreign = createJwtTokenService({
      secret: 'someone-elses-secret-of-32-characters',
      ttlSeconds: 60,
    });
    const auth = services().auth;

    expect(await auth.authenticate(undefined)).toBeNull();
    expect(await auth.authenticate('not.a.token')).toBeNull();
    expect(
      await auth.authenticate(await foreign.issue(UserId('id-000001')))
    ).toBeNull();
    expect(
      await auth.authenticate(await deps.tokens.issue(UserId('deleted')))
    ).toBeNull();
  });
});
