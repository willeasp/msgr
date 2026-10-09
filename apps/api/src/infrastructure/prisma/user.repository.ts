import type { UserRepository } from '../../application/ports.js';
import {
  UserId,
  type Email,
  type PasswordHash,
  type User,
} from '../../domain/user.js';
import type { Prisma, PrismaClient } from './client.js';

const userFields = {
  id: true,
  email: true,
  name: true,
} satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof userFields }>;

export function prismaUserRepository(db: PrismaClient): UserRepository {
  return {
    async findByIds(ids) {
      const rows = await db.user.findMany({
        where: { id: { in: [...ids] } },
        select: userFields,
      });
      return rows.map(toUser);
    },

    async findCredentials(email) {
      const row = await db.user.findUnique({
        where: { email },
        select: { ...userFields, password: true },
      });
      return (
        row && { user: toUser(row), passwordHash: row.password as PasswordHash }
      );
    },

    async search(term, { excluding, limit }) {
      // Prisma hands `contains` to LIKE as-is; escape so "%" and "_" match literally.
      const literal = term.replace(/[\\%_]/g, '\\$&');
      const rows = await db.user.findMany({
        where: {
          id: { not: excluding },
          OR: [
            { name: { contains: literal, mode: 'insensitive' } },
            { email: { contains: literal, mode: 'insensitive' } },
          ],
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: limit,
        select: userFields,
      });
      return rows.map(toUser);
    },
  };
}

const toUser = (row: UserRow): User => ({
  id: UserId(row.id),
  email: row.email as Email,
  name: row.name,
});
