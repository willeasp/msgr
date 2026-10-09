import DataLoader from 'dataloader';
import type { Chat, ChatId } from '../domain/chat.js';
import type { Message } from '../domain/message.js';
import type { Page } from '../domain/page.js';
import type { User, UserId } from '../domain/user.js';
import type { Repositories } from './ports.js';

/**
 * Request-scoped batched reads. Every keyed lookup made while resolving one
 * operation is collected per tick and sent to the repository as one query.
 */
export interface Loaders {
  readonly user: DataLoader<UserId, User | null>;
  readonly chat: DataLoader<ChatId, Chat | null>;
  messages(page: Page): DataLoader<ChatId, Message[]>;
}

export interface LoaderOptions {
  /**
   * Memoise results for the loaders' lifetime. Turn off for long-lived scopes
   * such as a subscription, where results would otherwise go stale.
   */
  readonly cache: boolean;
}

export function createLoaders(
  { users, chats, messages }: Repositories,
  { cache }: LoaderOptions
): Loaders {
  const pages = new Map<string, DataLoader<ChatId, Message[]>>();

  return {
    user: byId((ids) => users.findByIds(ids), cache),
    chat: byId((ids) => chats.findByIds(ids), cache),
    messages(page) {
      const key = `${page.limit}:${page.offset}`;
      let loader = pages.get(key);
      if (!loader) {
        loader = new DataLoader(
          async (chatIds) => {
            const found = groupBy(
              await messages.findPages(chatIds, page),
              (message) => message.chatId
            );
            return chatIds.map((chatId) => found.get(chatId) ?? []);
          },
          { cache }
        );
        pages.set(key, loader);
      }
      return loader;
    },
  };
}

/** Loads a related entity the schema guarantees exists; absence is a defect. */
export async function loadExisting<K, V>(
  loader: DataLoader<K, V | null>,
  key: K
): Promise<V> {
  const value = await loader.load(key);
  if (value === null) {
    throw new Error(`Dangling reference: ${String(key)}`);
  }
  return value;
}

function byId<K, V extends { readonly id: K }>(
  fetch: (ids: readonly K[]) => Promise<V[]>,
  cache: boolean
): DataLoader<K, V | null> {
  return new DataLoader(
    async (ids) => {
      const found = new Map(
        (await fetch(ids)).map((value) => [value.id, value])
      );
      return ids.map((id) => found.get(id) ?? null);
    },
    { cache }
  );
}

function groupBy<K, V>(values: readonly V[], keyOf: (value: V) => K) {
  const groups = new Map<K, V[]>();
  for (const value of values) {
    const group = groups.get(keyOf(value));
    if (group) group.push(value);
    else groups.set(keyOf(value), [value]);
  }
  return groups;
}
