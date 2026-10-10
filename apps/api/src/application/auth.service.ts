import {
  invalidCredentials,
  invalidInput,
  notFound,
  tooManyAttempts,
  type InvalidCredentials,
  type InvalidInput,
  type NotFound,
  type TooManyAttempts,
} from '../domain/errors.js';
import { directPair, type DirectChat } from '../domain/chat.js';
import { InviteCode } from '../domain/invite.js';
import { err, ok, type Result } from '../domain/result.js';
import {
  DisplayName,
  Email,
  NewPassword,
  type Session,
  type User,
} from '../domain/user.js';
import type { Loaders } from './loaders.js';
import { createNotifier } from './notifier.js';
import type { Dependencies } from './ports.js';

export type AuthService = ReturnType<typeof createAuthService>;

/** A new account's session, and its direct chat with whoever invited it. */
export interface Welcome extends Session {
  /** `null` for an account nobody invited: the first, from the command line. */
  readonly chat: DirectChat | null;
}

export function createAuthService(deps: Dependencies, loaders: Loaders) {
  const { repositories, passwords, tokens, throttle, clock, chatEvents } =
    deps;
  const notifier = createNotifier(deps);
  return {
    /** Every failure looks the same, so the response never reveals which emails exist. */
    async login(input: {
      readonly email: string;
      readonly password: string;
    }): Promise<Result<Session, InvalidCredentials | TooManyAttempts>> {
      const email = Email.parse(input.email);
      if (!email.ok) return err(invalidCredentials());
      if (!throttle.attempt(`login:${email.value}`)) {
        return err(tooManyAttempts());
      }

      const credentials = await repositories.users.findCredentials(email.value);
      const verified = await passwords.verify(
        input.password,
        credentials?.passwordHash ?? null
      );
      if (!credentials || !verified) return err(invalidCredentials());

      const { user } = credentials;
      return ok({ user, token: await tokens.issue(user.id) });
    },

    /** Spends an invite on a new account and signs it in. */
    async signUp(input: {
      readonly inviteCode: string;
      readonly name: string;
      readonly email: string;
      readonly password: string;
    }): Promise<Result<Welcome, InvalidInput | NotFound>> {
      const code = InviteCode.parse(input.inviteCode);
      if (!code.ok) return code;
      const name = DisplayName.parse(input.name);
      if (!name.ok) return name;
      const email = Email.parse(input.email);
      if (!email.ok) return email;
      const password = NewPassword.parse(input.password);
      if (!password.ok) return password;

      // Checked before hashing, so made-up codes cost nothing.
      const now = clock();
      if (!(await repositories.invites.isRedeemable(code.value, now))) {
        return err(notFound('Invite'));
      }

      const redeemed = await repositories.invites.redeem(
        code.value,
        {
          email: email.value,
          name: name.value,
          passwordHash: await passwords.hash(password.value),
        },
        now
      );
      if (!redeemed.ok) {
        return err(
          redeemed.error === 'EmailTaken'
            ? invalidInput('email', 'Someone already signed up with this email')
            : notFound('Invite')
        );
      }

      const { user, invitedBy } = redeemed.value;
      // They know each other: start their chat, and tell whoever sent the invite.
      let chat: DirectChat | null = null;
      if (invitedBy) {
        const pair = directPair(invitedBy, user.id);
        if (!pair.ok) throw new Error(`${user.id} cannot have invited itself`);
        chat = await repositories.chats.saveDirect(pair.value);
        const event = { chat, by: user.id, reason: 'invite-accepted' } as const;
        await chatEvents.publish(event, invitedBy);
        // Not awaited: signing up needn't wait for push services.
        void notifier.chatAdded(event, user, invitedBy);
      }
      return ok({ user, token: await tokens.issue(user.id), chat });
    },

    /** The user behind a session token, or `null` for an anonymous viewer. */
    async authenticate(token: string | undefined): Promise<User | null> {
      if (!token) return null;
      const userId = await tokens.verify(token);
      return userId ? loaders.user.load(userId) : null;
    },
  };
}
