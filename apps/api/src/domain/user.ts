import type { Brand } from './brand.js';
import { invalidInput, type InvalidInput } from './errors.js';
import { Picture, type PictureCodec, type RawPicture } from './picture.js';
import { err, ok, type Result } from './result.js';

export type UserId = Brand<string, 'UserId'>;
export const UserId = (value: string): UserId => value as UserId;

export interface User {
  readonly id: UserId;
  readonly email: Email;
  readonly name: string;
  /** Null for the default: a pattern made from their id. */
  readonly avatar: Avatar | null;
}

/** Someone's profile picture: a picture exactly 64 pixels square. */
export type Avatar = Picture & { readonly width: 64; readonly height: 64 };
export const Avatar = {
  SIDE: 64 as const,
  parse(raw: RawPicture, codec: PictureCodec): Result<Avatar, InvalidInput> {
    if (raw.width !== Avatar.SIDE || raw.height !== Avatar.SIDE) {
      return err(
        invalidInput(
          'avatar',
          `A profile picture must be ${Avatar.SIDE} by ${Avatar.SIDE} pixels`
        )
      );
    }
    const picture = Picture.parse(raw, codec);
    if (!picture.ok) {
      return err(invalidInput('avatar', picture.error.reason));
    }
    return ok(picture.value as Avatar);
  },
};

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

/** What someone shows others of themselves, all of it saved at once. */
export interface Profile {
  readonly name: DisplayName;
  /** Null for the default. */
  readonly avatar: Avatar | null;
}
export const Profile = {
  parse(
    raw: { readonly name: string; readonly avatar: RawPicture | null },
    codec: PictureCodec
  ): Result<Profile, InvalidInput> {
    const name = DisplayName.parse(raw.name);
    if (!name.ok) return name;
    if (raw.avatar === null) return ok({ name: name.value, avatar: null });
    const avatar = Avatar.parse(raw.avatar, codec);
    if (!avatar.ok) return avatar;
    return ok({ name: name.value, avatar: avatar.value });
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
