import { randomBytes } from 'node:crypto';
import type { InviteCodes } from '../application/ports.js';
import type { InviteCode } from '../domain/invite.js';

/** 128 random bits, base64url-encoded: 22 characters, unguessable. */
export const randomInviteCodes: InviteCodes = () =>
  randomBytes(16).toString('base64url') as InviteCode;
