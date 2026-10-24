import bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import type { PasswordHasher } from '../application/ports.js';
import type { PasswordHash } from '../domain/user.js';

const COST = 10;

export const hashPassword = async (password: string): Promise<PasswordHash> =>
  (await bcrypt.hash(password, COST)) as PasswordHash;

export function createBcryptPasswordHasher(): PasswordHasher {
  // A real digest of a secret nobody knows: checking against it costs exactly
  // as much as checking a real one, and never succeeds. Made off the main
  // thread, so booting doesn't wait for it; it's ready long before a login.
  const decoy = bcrypt.hash(randomUUID(), COST);
  return {
    hash: hashPassword,
    verify: async (password, hash) =>
      bcrypt.compare(password, hash ?? (await decoy)),
  };
}
