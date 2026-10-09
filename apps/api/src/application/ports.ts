import type { Chat, ChatId, DirectChat, DirectPair } from '../domain/chat.js';
import type { Message, NewMessage } from '../domain/message.js';
import type { Page } from '../domain/page.js';
import type {
  Credentials,
  Email,
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

export interface Repositories {
  readonly users: UserRepository;
  readonly chats: ChatRepository;
  readonly messages: MessageRepository;
}

export interface PasswordHasher {
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

export type Clock = () => Date;

/** Everything the application needs from the outside world. */
export interface Dependencies {
  readonly repositories: Repositories;
  readonly passwords: PasswordHasher;
  readonly tokens: TokenService;
  readonly events: MessageEvents;
  readonly clock: Clock;
}
