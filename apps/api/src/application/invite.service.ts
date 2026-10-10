import { InviteCode, newInvite, type Invite } from '../domain/invite.js';
import type { User } from '../domain/user.js';
import type { Dependencies } from './ports.js';

export type InviteService = ReturnType<typeof createInviteService>;

export function createInviteService({
  repositories,
  inviteCodes,
  clock,
}: Dependencies) {
  return {
    /** A single-use invite from the viewer, for someone new. */
    async create(viewer: User): Promise<Invite> {
      const invite = newInvite(inviteCodes(), viewer.id, clock());
      await repositories.invites.create(invite);
      return invite;
    },

    /** Whether a code can still sign someone up. Used, expired and made-up look the same. */
    async isRedeemable(raw: string): Promise<boolean> {
      const code = InviteCode.parse(raw);
      return code.ok && repositories.invites.isRedeemable(code.value, clock());
    },
  };
}
