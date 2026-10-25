import { Prisma } from './client.js';

/** Whether Postgres refused a write for a value already taken (Prisma's P2002). */
export const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2002';
