import type { Brand } from './brand.js';
import { notFound, type NotFound } from './errors.js';
import { err, ok, type Result } from './result.js';
import type { UserId } from './user.js';

/**
 * The secret in an invite link: 128 random bits, base64url-encoded. Anything
 * else is an invite that does not exist.
 */
export type InviteCode = Brand<string, 'InviteCode'>;
export const InviteCode = {
  parse(raw: string): Result<InviteCode, NotFound> {
    const code = raw.trim();
    return /^[A-Za-z0-9_-]{22}$/.test(code)
      ? ok(code as InviteCode)
      : err(notFound('Invite'));
  },
};

/** A single-use way in for someone new. */
export interface Invite {
  readonly code: InviteCode;
  /** `null` for the first invites, made from the command line. */
  readonly invitedBy: UserId | null;
  readonly expiresAt: Date;
}

export const INVITE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

export const newInvite = (
  code: InviteCode,
  invitedBy: UserId | null,
  now: Date
): Invite => ({
  code,
  invitedBy,
  expiresAt: new Date(now.getTime() + INVITE_LIFETIME_MS),
});
