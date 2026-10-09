import { describe, expect, it, vi } from 'vitest';
import type { Clock } from './ports.js';
import { UserId } from '../domain/user.js';
import { createJwtTokenService } from '../infrastructure/token-service.js';
import { newInvite, type InviteCode } from '../domain/invite.js';
import {
  createTestApp,
  expectOk,
  fakeHash,
  fakePasswordHasher,
  nextEvent,
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
    const { services } = createTestApp({
      passwords: { ...fakePasswordHasher, verify },
    });

    await services().auth.login({ email: 'nobody@example.com', password: 'x' });

    expect(verify).toHaveBeenCalledWith('x', null);
  });
});

describe('login throttling', () => {
  it('refuses an email that has been tried too often, without checking the password', async () => {
    const verify = vi.fn(fakePasswordHasher.verify);
    const attempt = vi.fn(() => false);
    const { services } = createTestApp({
      passwords: { ...fakePasswordHasher, verify },
      throttle: { attempt },
    });

    expect(
      await services().auth.login({
        email: ' ADA@example.com',
        password: 'correct horse',
      })
    ).toEqual({ ok: false, error: { type: 'TooManyAttempts' } });
    expect(attempt).toHaveBeenCalledWith('login:ada@example.com');
    expect(verify).not.toHaveBeenCalled();
  });
});

/** A clock the test moves by hand. */
function handClock(start = '2030-01-01T00:00:00.000Z') {
  let now = new Date(start).getTime();
  const clock: Clock = () => new Date(now);
  return {
    clock,
    advanceDays: (days: number) => (now += days * 24 * 60 * 60 * 1000),
  };
}

describe('signUp', () => {
  async function invited(overrides: Parameters<typeof createTestApp>[0] = {}) {
    const app = createTestApp(overrides);
    const ada = await app.fixtures.user({ name: 'Ada' });
    const invite = await app.services().invites.create(ada);
    const signUp = (input: Partial<Record<string, string>> = {}) =>
      app.services().auth.signUp({
        inviteCode: invite.code,
        name: 'Grace Hopper',
        email: 'grace@example.com',
        password: 'cobol-forever',
        ...input,
      });
    return { ...app, ada, invite, signUp };
  }

  it('starts a direct chat with whoever sent the invite, and tells them', async () => {
    const { services, ada, signUp } = await invited();
    const adaHears = nextEvent(services().chats.additions(ada));

    const welcome = expectOk(await signUp());

    expect(welcome.chat).toEqual({
      kind: 'direct',
      id: welcome.chat?.id,
      participantIds: [ada.id, welcome.user.id].sort(),
    });
    expect(await adaHears).toEqual({
      chat: welcome.chat,
      by: welcome.user.id,
      reason: 'invite-accepted',
    });
  });

  it('starts no chat for the very first account, which nobody invited', async () => {
    const app = createTestApp();
    const code = 'first0000000000000000x' as InviteCode;
    await app.deps.repositories.invites.create(
      newInvite(code, null, app.deps.clock())
    );

    const welcome = expectOk(
      await app.services().auth.signUp({
        inviteCode: code,
        name: 'Ada',
        email: 'ada@example.com',
        password: 'difference-engine',
      })
    );

    expect(welcome.chat).toBeNull();
  });

  it('creates the account and signs it in', async () => {
    const { services, signUp } = await invited();

    const session = expectOk(await signUp({ email: ' Grace@Example.com ' }));

    expect(session.user).toMatchObject({
      name: 'Grace Hopper',
      email: 'grace@example.com',
    });
    expect(await services().auth.authenticate(session.token)).toEqual(
      session.user
    );
    expect(
      expectOk(
        await services().auth.login({
          email: 'grace@example.com',
          password: 'cobol-forever',
        })
      ).user
    ).toEqual(session.user);
  });

  it('works once per invite', async () => {
    const { signUp } = await invited();
    expectOk(await signUp());

    expect(await signUp({ email: 'linus@example.com' })).toEqual({
      ok: false,
      error: { type: 'NotFound', entity: 'Invite' },
    });
  });

  it('refuses an invite after a week', async () => {
    const { clock, advanceDays } = handClock();
    const { signUp } = await invited({ clock });

    advanceDays(8);

    expect(await signUp()).toEqual({
      ok: false,
      error: { type: 'NotFound', entity: 'Invite' },
    });
  });

  it('turns away a made-up invite before spending any effort hashing', async () => {
    const hash = vi.fn(fakePasswordHasher.hash);
    const { signUp } = await invited({
      passwords: { ...fakePasswordHasher, hash },
    });

    for (const inviteCode of ['made-up', 'invite9999999999999999']) {
      expect(await signUp({ inviteCode })).toEqual({
        ok: false,
        error: { type: 'NotFound', entity: 'Invite' },
      });
    }
    expect(hash).not.toHaveBeenCalled();
  });

  it('says so when the email already has an account, and keeps the invite', async () => {
    const { signUp, fixtures } = await invited();
    await fixtures.user({ name: 'Grace', email: 'grace@example.com' });

    expect(await signUp()).toEqual({
      ok: false,
      error: {
        type: 'InvalidInput',
        field: 'email',
        reason: 'Someone already signed up with this email',
      },
    });
    expect((await signUp({ email: 'hopper@example.com' })).ok).toBe(true);
  });

  it.each([
    ['name', { name: '  ' }],
    ['email', { email: 'grace' }],
    ['password', { password: 'short' }],
  ])('checks the %s', async (field, input) => {
    const { signUp } = await invited();

    expect(await signUp(input)).toMatchObject({
      ok: false,
      error: { type: 'InvalidInput', field },
    });
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
