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
import type { LinkPreview } from '../domain/link-preview.js';
import type { Url } from '../domain/link.js';
import type { Message, MessageId, NewMessage } from '../domain/message.js';
import type { Page } from '../domain/page.js';
import type { Notification, PushSubscription } from '../domain/push.js';
import type { Result } from '../domain/result.js';
import type { PictureCodec } from '../domain/picture.js';
import type {
  Credentials,
  Email,
  NewPassword,
  NewUser,
  PasswordHash,
  Profile,
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
  /** Replaces the user's name and picture; the user as they are now. */
  saveProfile(id: UserId, profile: Profile): Promise<User>;
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
  findByIds(ids: readonly MessageId[]): Promise<Message[]>;
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

/** A browser's push subscription, and the user it notifies. */
export interface OwnedPushSubscription {
  readonly userId: UserId;
  readonly subscription: PushSubscription;
}

/** Where each user's browsers receive Web Push. A browser notifies one user at a time. */
export interface PushSubscriptionRepository {
  /** Upserts by endpoint: a browser someone else had now notifies `userId`, with its newest keys. */
  save(userId: UserId, subscription: PushSubscription): Promise<void>;
  findByUserIds(ids: readonly UserId[]): Promise<OwnedPushSubscription[]>;
  /** Forgets a browser; a no-op unless it notifies `userId`. */
  remove(endpoint: string, userId: UserId): Promise<void>;
}

export interface Repositories {
  readonly users: UserRepository;
  readonly chats: ChatRepository;
  readonly messages: MessageRepository;
  readonly invites: InviteRepository;
  readonly pushSubscriptions: PushSubscriptionRepository;
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

/** Tells everyone who shares a chat with someone that their profile changed, live. */
export interface ProfileEvents {
  publish(user: User, recipients: readonly UserId[]): Promise<void>;
  subscribe(recipient: UserId): AsyncIterableIterator<User>;
}

/** Who has which chat open in a visible window right now. Its messages don't notify them. */
export interface Watching {
  /** Counts `userId` as watching `chatId` until the returned function is called. */
  watch(userId: UserId, chatId: ChatId): () => void;
  isWatching(userId: UserId, chatId: ChatId): boolean;
}

/** Sends one notification to one browser through its push service. */
export interface PushSender {
  /** 'gone' when the push service says the browser unsubscribed. Other failures throw. */
  send(
    subscription: PushSubscription,
    notification: Notification
  ): Promise<'sent' | 'gone'>;
}

export type Clock = () => Date;

/** Reads a page for its card. Never throws: anything a site gets wrong is null. */
export interface LinkPreviewer {
  preview(url: Url): Promise<LinkPreview | null>;
}

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
  readonly profileEvents: ProfileEvents;
  readonly clock: Clock;
  readonly inviteCodes: InviteCodes;
  readonly throttle: Throttle;
  readonly linkPreviewer: LinkPreviewer;
  readonly pictures: PictureCodec;
  readonly pushSender: PushSender;
  /** The VAPID public key browsers subscribe with; null while push is off. */
  readonly pushKey: string | null;
  readonly watching: Watching;
}
