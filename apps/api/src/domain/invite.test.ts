import { describe, expect, it } from 'vitest';
import { InviteCode, newInvite } from './invite.js';
import { UserId } from './user.js';

const CODE = 'q7Hk2xZ0aB9cD4eF5gH6iJ';

describe('InviteCode.parse', () => {
  it('accepts a code as the invite link carries it', () => {
    expect(InviteCode.parse(` ${CODE} `)).toEqual({ ok: true, value: CODE });
  });

  it.each(['', 'short', `${CODE}x`, 'q7Hk2xZ0aB9cD4eF5gH6i!'])(
    'treats %j as an invite that does not exist',
    (raw) => {
      expect(InviteCode.parse(raw)).toEqual({
        ok: false,
        error: { type: 'NotFound', entity: 'Invite' },
      });
    }
  );
});

describe('newInvite', () => {
  it('lasts seven days', () => {
    const now = new Date('2030-01-01T00:00:00.000Z');

    expect(newInvite(CODE as InviteCode, UserId('ada'), now)).toEqual({
      code: CODE,
      invitedBy: 'ada',
      expiresAt: new Date('2030-01-08T00:00:00.000Z'),
    });
  });
});
