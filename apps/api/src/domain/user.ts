import type { Brand } from './brand.js';
import { invalidInput, type InvalidInput } from './errors.js';
import { err, ok, type Result } from './result.js';

export type UserId = Brand<string, 'UserId'>;
export const UserId = (value: string): UserId => value as UserId;

export interface User {
  readonly id: UserId;
  readonly email: Email;
  readonly name: string;
}

/** What someone calls themselves: trimmed, non-empty, at most 50 characters. */
export type DisplayName = Brand<string, 'DisplayName'>;
export const DisplayName = {
  MAX_LENGTH: 50,
  parse(raw: string): Result<DisplayName, InvalidInput> {
    const name = raw.trim();
    if (name.length === 0) {
      return err(invalidInput('name', 'Must not be blank'));
    }
    if (name.length > DisplayName.MAX_LENGTH) {
      return err(
        invalidInput(
          'name',
          `Must be at most ${DisplayName.MAX_LENGTH} characters`
        )
      );
    }
    return ok(name as DisplayName);
  },
};

/** Trimmed, lower-cased, `local@domain`. Comparing two Emails is comparing strings. */
export type Email = Brand<string, 'Email'>;
export const Email = {
  MAX_LENGTH: 254,
  parse(raw: string): Result<Email, InvalidInput> {
    const email = raw.trim().toLowerCase();
    if (email.length > Email.MAX_LENGTH || !/^[^\s@]+@[^\s@]+$/.test(email)) {
      return err(invalidInput('email', 'Must be a valid email address'));
    }
    return ok(email as Email);
  },
};

/** A stored bcrypt digest. Never leaves the identity code path. */
export type PasswordHash = Brand<string, 'PasswordHash'>;

/**
 * A password someone is choosing, kept exactly as typed. bcrypt ignores
 * everything past 72 bytes, so longer ones are refused rather than cut short.
 */
export type NewPassword = Brand<string, 'NewPassword'>;
export const NewPassword = {
  MIN_LENGTH: 8,
  MAX_BYTES: 72,
  parse(raw: string): Result<NewPassword, InvalidInput> {
    if (raw.length < NewPassword.MIN_LENGTH) {
      return err(
        invalidInput(
          'password',
          `Must be at least ${NewPassword.MIN_LENGTH} characters`
        )
      );
    }
    if (new TextEncoder().encode(raw).length > NewPassword.MAX_BYTES) {
      return err(invalidInput('password', 'Must be shorter'));
    }
    return ok(raw as NewPassword);
  },
};

/** Everything needed to create a user. */
export interface NewUser {
  readonly email: Email;
  readonly name: DisplayName;
  readonly passwordHash: PasswordHash;
}

export interface Credentials {
  readonly user: User;
  readonly passwordHash: PasswordHash;
}

/** A signed, expiring proof that the bearer is `user`. */
export type SessionToken = Brand<string, 'SessionToken'>;

export interface Session {
  readonly user: User;
  readonly token: SessionToken;
}

/** What a viewer typed into "find people": trimmed and non-empty. */
export type SearchTerm = Brand<string, 'SearchTerm'>;
export const SearchTerm = {
  MAX_LENGTH: 100,
  /** A search never returns more than this many users. */
  RESULT_LIMIT: 20,
  parse(raw: string): Result<SearchTerm, InvalidInput> {
    const term = raw.trim();
    if (term.length === 0) {
      return err(invalidInput('query', 'Must not be blank'));
    }
    if (term.length > SearchTerm.MAX_LENGTH) {
      return err(
        invalidInput(
          'query',
          `Must be at most ${SearchTerm.MAX_LENGTH} characters`
        )
      );
    }
    return ok(term as SearchTerm);
  },
};
