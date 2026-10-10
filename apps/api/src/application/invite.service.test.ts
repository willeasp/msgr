import { describe, expect, it } from 'vitest';
import { newInvite, type InviteCode } from '../domain/invite.js';
import { createTestApp, expectOk } from '../testing/harness.js';

describe('invites', () => {
  it('makes a single-use invite that lasts a week', async () => {
    const app = createTestApp();
    const ada = await app.fixtures.user({ name: 'Ada' });

    const invite = await app.services().invites.create(ada);

    expect(invite).toEqual({
      code: 'invite0000000000000001',
      invitedBy: ada.id,
      expiresAt: new Date('2030-01-08T00:00:00.000Z'),
    });
    expect(
      await app.deps.repositories.invites.isRedeemable(
        invite.code,
        new Date('2030-01-07T23:59:59.000Z')
      )
    ).toBe(true);
  });

  it('says whether an invite can still sign someone up, the same for used, expired and made-up ones', async () => {
    const app = createTestApp();
    const ada = await app.fixtures.user({ name: 'Ada' });
    const invites = app.services().invites;
    const used = await invites.create(ada);
    expectOk(
      await app.services().auth.signUp({
        inviteCode: used.code,
        name: 'Grace Hopper',
        email: 'grace@example.com',
        password: 'cobol-forever',
      })
    );
    const expired = 'expired000000000000000' as InviteCode;
    await app.deps.repositories.invites.create(
      newInvite(expired, ada.id, new Date('2020-01-01T00:00:00.000Z'))
    );
    const fresh = await invites.create(ada);

    expect(await invites.isRedeemable(fresh.code)).toBe(true);
    for (const code of [
      used.code,
      expired,
      'made-up',
      'invite9999999999999999',
    ]) {
      expect(await invites.isRedeemable(code)).toBe(false);
    }
  });
});
