import {
  invalidCredentials,
  type InvalidCredentials,
} from '../domain/errors.js';
import { err, ok, type Result } from '../domain/result.js';
import { Email, type Session, type User } from '../domain/user.js';
import type { Loaders } from './loaders.js';
import type { Dependencies } from './ports.js';

export type AuthService = ReturnType<typeof createAuthService>;

export function createAuthService(
  { repositories, passwords, tokens }: Dependencies,
  loaders: Loaders
) {
  return {
    /** Every failure looks the same, so the response never reveals which emails exist. */
    async login(input: {
      readonly email: string;
      readonly password: string;
    }): Promise<Result<Session, InvalidCredentials>> {
      const email = Email.parse(input.email);
      if (!email.ok) return err(invalidCredentials());

      const credentials = await repositories.users.findCredentials(email.value);
      const verified = await passwords.verify(
        input.password,
        credentials?.passwordHash ?? null
      );
      if (!credentials || !verified) return err(invalidCredentials());

      const { user } = credentials;
      return ok({ user, token: await tokens.issue(user.id) });
    },

    /** The user behind a session token, or `null` for an anonymous viewer. */
    async authenticate(token: string | undefined): Promise<User | null> {
      if (!token) return null;
      const userId = await tokens.verify(token);
      return userId ? loaders.user.load(userId) : null;
    },
  };
}
