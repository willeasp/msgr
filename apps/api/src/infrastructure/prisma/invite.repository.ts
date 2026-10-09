import { createHash } from 'node:crypto';
import type { InviteRepository } from '../../application/ports.js';
import type { InviteCode } from '../../domain/invite.js';
import { err, ok } from '../../domain/result.js';
import { UserId, type Email } from '../../domain/user.js';
import { Prisma, type PrismaClient } from './client.js';

/** Rows hold a hash of the code, so a leaked database cannot sign anyone up. */
const hashOf = (code: InviteCode) =>
  createHash('sha256').update(code).digest('hex');

/** Thrown inside the transaction to roll it back. */
class Abort extends Error {
  constructor(readonly reason: 'InviteUnavailable' | 'EmailTaken') {
    super(reason);
  }
}

export function prismaInviteRepository(db: PrismaClient): InviteRepository {
  return {
    async create({ code, invitedBy, expiresAt }) {
      await db.invite.create({
        data: { codeHash: hashOf(code), invitedById: invitedBy, expiresAt },
      });
    },

    async isRedeemable(code, at) {
      const count = await db.invite.count({
        where: { codeHash: hashOf(code), usedAt: null, expiresAt: { gt: at } },
      });
      return count > 0;
    },

    async redeem(code, { email, name, passwordHash }, at) {
      const codeHash = hashOf(code);
      try {
        const row = await db.$transaction(async (tx) => {
          // Claiming first, conditionally, is what makes an invite single-use
          // even when two people redeem it at once.
          const claimed = await tx.invite.updateMany({
            where: { codeHash, usedAt: null, expiresAt: { gt: at } },
            data: { usedAt: at },
          });
          if (claimed.count === 0) throw new Abort('InviteUnavailable');

          const user = await tx.user
            .create({
              data: { email, name, password: passwordHash },
              select: { id: true, email: true, name: true },
            })
            .catch((error: unknown) => {
              throw isUniqueViolation(error) ? new Abort('EmailTaken') : error;
            });
          await tx.invite.update({
            where: { codeHash },
            data: { usedById: user.id },
          });
          return user;
        });
        return ok({
          id: UserId(row.id),
          email: row.email as Email,
          name: row.name,
        });
      } catch (error) {
        if (error instanceof Abort) return err(error.reason);
        throw error;
      }
    },
  };
}

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2002';
