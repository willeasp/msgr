import bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import type { PasswordHasher } from '../application/ports.js';
import type { PasswordHash } from '../domain/user.js';

const COST = 10;

export const hashPassword = async (password: string): Promise<PasswordHash> =>
  (await bcrypt.hash(password, COST)) as PasswordHash;

export function createBcryptPasswordHasher(): PasswordHasher {
  // A real digest of a secret nobody knows: checking against it costs exactly
  // as much as checking a real one, and never succeeds.
  const decoy = bcrypt.hashSync(randomUUID(), COST);
  return {
    hash: hashPassword,
    verify: (password, hash) => bcrypt.compare(password, hash ?? decoy),
  };
}
