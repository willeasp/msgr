import type {
  ChannelChat,
  ChannelName,
  Chat,
  ChatAdded,
  ChatId,
  DirectChat,
  DirectPair,
} from '../domain/chat.js';
import type { Invite, InviteCode } from '../domain/invite.js';
import type { Message, NewMessage } from '../domain/message.js';
import type { Page } from '../domain/page.js';
import type { Result } from '../domain/result.js';
import type {
  Credentials,
  Email,
  NewPassword,
  NewUser,
  PasswordHash,
  SearchTerm,
  SessionToken,
  User,
  UserId,
} from '../domain/user.js';

/*
 * The seams between the application and the outside world. Production wires
 * the adapters in `infrastructure/`; tests wire the in-memory ones in
 * `testing/`. Keyed reads take many keys at once so DataLoader can batch them;
 * they return only what exists, in any order.
 */

export interface UserRepository {
  findByIds(ids: readonly UserId[]): Promise<User[]>;
  findCredentials(email: Email): Promise<Credentials | null>;
  /** Name or email contains `term` (case-insensitive), ordered by name. */
  search(
    term: SearchTerm,
    options: { readonly excluding: UserId; readonly limit: number }
  ): Promise<User[]>;
}

export interface ChatRepository {
  findByIds(ids: readonly ChatId[]): Promise<Chat[]>;
  /** Most recently active first. */
  findByParticipant(userId: UserId): Promise<Chat[]>;
  /** Idempotent and race-safe: the pair's existing chat, or a new one. */
  saveDirect(pair: DirectPair): Promise<DirectChat>;
  /** Every channel, ordered by name. */
  findChannels(): Promise<ChannelChat[]>;
  /**
   * The channel called `name`, with `userId` in it: created on first join.
   * Idempotent and race-safe. Joining is not activity.
   */
  joinChannel(name: ChannelName, userId: UserId): Promise<ChannelChat>;
  /** Takes `userId` out of a channel; a no-op if they weren't in it. Not activity. */
  leaveChannel(chatId: ChatId, userId: UserId): Promise<void>;
}

export interface MessageRepository {
  /**
   * For each chat, `page` counted from its newest message, returned oldest
   * first. Ties on `createdAt` are broken by id.
   */
  findPages(chatIds: readonly ChatId[], page: Page): Promise<Message[]>;
  /** Stores the message and marks its chat as active, atomically. */
  append(message: NewMessage): Promise<Message>;
}

export interface InviteRepository {
  create(invite: Invite): Promise<void>;
  /** Unused, and not yet expired at `at`. */
  isRedeemable(code: InviteCode, at: Date): Promise<boolean>;
  /**
   * Spends the invite on a new user, atomically: if anything fails, nothing
   * changes. A used, expired or unknown invite is `InviteUnavailable`.
   */
  redeem(
    code: InviteCode,
    user: NewUser,
    at: Date
  ): Promise<
    Result<
      { readonly user: User; readonly invitedBy: UserId | null },
      'InviteUnavailable' | 'EmailTaken'
    >
  >;
}

export interface Repositories {
  readonly users: UserRepository;
  readonly chats: ChatRepository;
  readonly messages: MessageRepository;
  readonly invites: InviteRepository;
}

export interface PasswordHasher {
  hash(password: NewPassword): Promise<PasswordHash>;
  /**
   * With `hash === null` the password is checked against a decoy, so a login
   * for an unknown email takes as long as one with a wrong password.
   */
  verify(password: string, hash: PasswordHash | null): Promise<boolean>;
}

export interface TokenService {
  issue(userId: UserId): Promise<SessionToken>;
  /** The token's user, or `null` for anything forged, expired or malformed. */
  verify(token: string): Promise<UserId | null>;
}

export interface MessageEvents {
  publish(message: Message, recipients: readonly UserId[]): Promise<void>;
  subscribe(recipient: UserId): AsyncIterableIterator<Message>;
}

/** Tells someone a chat now includes them, live. */
export interface ChatEvents {
  publish(event: ChatAdded, recipient: UserId): Promise<void>;
  subscribe(recipient: UserId): AsyncIterableIterator<ChatAdded>;
}

export type Clock = () => Date;

/** A fresh, unguessable invite code. */
export type InviteCodes = () => InviteCode;

/** Counts attempts per key and refuses a key that has had too many lately. */
export interface Throttle {
  /** Records an attempt; `false` if `key` is already over its limit. */
  attempt(key: string): boolean;
}

/** Everything the application needs from the outside world. */
export interface Dependencies {
  readonly repositories: Repositories;
  readonly passwords: PasswordHasher;
  readonly tokens: TokenService;
  readonly events: MessageEvents;
  readonly chatEvents: ChatEvents;
  readonly clock: Clock;
  readonly inviteCodes: InviteCodes;
  readonly throttle: Throttle;
}
