import { describe, expect, it } from 'vitest';
import { InviteCode } from '../domain/invite.js';
import { randomInviteCodes } from './invite-codes.js';

describe('randomInviteCodes', () => {
  it('makes codes that read back as valid, and never the same twice', () => {
    const codes = Array.from({ length: 100 }, randomInviteCodes);

    expect(codes.every((code) => InviteCode.parse(code).ok)).toBe(true);
    expect(new Set(codes).size).toBe(100);
  });
});
