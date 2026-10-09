import { beforeEach, describe, expect, it } from 'vitest';
import type { Repositories } from '../application/ports.js';
import {
  ChatId,
  directPair,
  type Chat,
  type GroupChat,
} from '../domain/chat.js';
import type { Message, MessageContent } from '../domain/message.js';
import {
  Email,
  SearchTerm,
  UserId,
  type PasswordHash,
  type User,
} from '../domain/user.js';

/** Creates what no repository method can: users and group chats. */
export interface Fixtures {
  user(input: {
    readonly name: string;
    readonly email?: string;
    readonly passwordHash?: PasswordHash;
  }): Promise<User>;
  groupChat(title: string, members: readonly User[]): Promise<GroupChat>;
}

/**
 * The behaviour every `Repositories` adapter must have. Run against the
 * in-memory adapter on every test run, and against Postgres when
 * TEST_DATABASE_URL is set; passing both is what lets service tests trust
 * the in-memory adapter.
 */
export function repositoryContract(
  setup: () => Promise<{ repositories: Repositories; fixtures: Fixtures }>
) {
  let repositories: Repositories;
  let fixtures: Fixtures;

  beforeEach(async () => {
    ({ repositories, fixtures } = await setup());
  });

  const send = (chat: Chat, sender: User, content: string, createdAt: string) =>
    repositories.messages.append({
      chatId: chat.id,
      senderId: sender.id,
      content: content as MessageContent,
      createdAt: new Date(createdAt),
    });

  const pairOf = (a: User, b: User) => {
    const pair = directPair(a.id, b.id);
    if (!pair.ok) throw new Error('Fixture users must differ');
    return pair.value;
  };

  describe('users', () => {
    it('finds users by id and skips unknown ids', async () => {
      const ada = await fixtures.user({ name: 'Ada' });

      expect(
        await repositories.users.findByIds([ada.id, UserId('missing')])
      ).toEqual([ada]);
    });

    it('finds credentials by email', async () => {
      const ada = await fixtures.user({
        name: 'Ada',
        email: 'ada@example.com',
        passwordHash: 'digest' as PasswordHash,
      });

      expect(
        await repositories.users.findCredentials(email('ada@example.com'))
      ).toEqual({ user: ada, passwordHash: 'digest' });
      expect(
        await repositories.users.findCredentials(email('nobody@example.com'))
      ).toBeNull();
    });

    it('searches names and emails case-insensitively, ordered by name, without the excluded user', async () => {
      const viewer = await fixtures.user({
        name: 'Ada Viewer',
        email: 'ada@example.com',
      });
      const grace = await fixtures.user({
        name: 'Grace Hopper',
        email: 'grace@navy.mil',
      });
      const adam = await fixtures.user({
        name: 'Adam Smith',
        email: 'adam@example.com',
      });
      await fixtures.user({ name: 'Linus', email: 'linus@kernel.org' });
      const search = (query: string, limit = 10) =>
        repositories.users.search(term(query), { excluding: viewer.id, limit });

      expect(await search('AD')).toEqual([adam]);
      expect(await search('NAVY')).toEqual([grace]);
      expect(await search('a')).toEqual([adam, grace]);
      expect(await search('a', 1)).toEqual([adam]);
    });

    it('matches % and _ literally', async () => {
      const viewer = await fixtures.user({ name: 'Viewer' });
      await fixtures.user({ name: 'Percy' });
      const search = (query: string) =>
        repositories.users.search(term(query), {
          excluding: viewer.id,
          limit: 10,
        });

      expect(await search('%')).toEqual([]);
      expect(await search('_')).toEqual([]);
    });
  });

  describe('chats', () => {
    it('keeps one direct chat per pair, whoever opens it', async () => {
      const ada = await fixtures.user({ name: 'Ada' });
      const grace = await fixtures.user({ name: 'Grace' });

      const opened = await repositories.chats.saveDirect(pairOf(ada, grace));
      const reopened = await repositories.chats.saveDirect(pairOf(grace, ada));

      expect(reopened).toEqual(opened);
      expect(opened).toEqual({
        kind: 'direct',
        id: opened.id,
        participantIds: [ada.id, grace.id].sort(),
      });
    });

    it('keeps a group of the same two people apart from their direct chat', async () => {
      const ada = await fixtures.user({ name: 'Ada' });
      const grace = await fixtures.user({ name: 'Grace' });
      const group = await fixtures.groupChat('Pair programming', [ada, grace]);

      const direct = await repositories.chats.saveDirect(pairOf(ada, grace));

      expect(direct.id).not.toBe(group.id);
      expect(
        sortById(
          await repositories.chats.findByIds([
            direct.id,
            group.id,
            ChatId('missing'),
          ])
        )
      ).toEqual(sortById([direct, group]));
    });

    it("lists a member's chats, most recently active first", async () => {
      const ada = await fixtures.user({ name: 'Ada' });
      const grace = await fixtures.user({ name: 'Grace' });
      const linus = await fixtures.user({ name: 'Linus' });
      const quiet = await fixtures.groupChat('Quiet', [ada, linus]);
      const direct = await repositories.chats.saveDirect(pairOf(ada, grace));
      const busy = await fixtures.groupChat('Busy', [ada, grace, linus]);
      await fixtures.groupChat('Without Ada', [grace, linus]);

      await send(direct, ada, 'hi', '2030-01-01T00:00:00Z');
      await send(busy, grace, 'hello all', '2031-01-01T00:00:00Z');

      expect(await repositories.chats.findByParticipant(ada.id)).toEqual([
        busy,
        direct,
        quiet,
      ]);
    });

    it('does not count reopening a direct chat as activity', async () => {
      const ada = await fixtures.user({ name: 'Ada' });
      const grace = await fixtures.user({ name: 'Grace' });
      const direct = await repositories.chats.saveDirect(pairOf(ada, grace));
      const group = await fixtures.groupChat('Group', [ada, grace]);
      await send(group, ada, 'ping', '2030-01-01T00:00:00Z');

      await repositories.chats.saveDirect(pairOf(grace, ada));

      expect(await repositories.chats.findByParticipant(ada.id)).toEqual([
        group,
        direct,
      ]);
    });
  });

  describe('messages', () => {
    it('pages back from the newest message, returning each page oldest first', async () => {
      const ada = await fixtures.user({ name: 'Ada' });
      const grace = await fixtures.user({ name: 'Grace' });
      const chat = await repositories.chats.saveDirect(pairOf(ada, grace));
      const sent: Message[] = [];
      for (let minute = 1; minute <= 5; minute++) {
        sent.push(
          await send(
            chat,
            minute % 2 ? ada : grace,
            `#${minute}`,
            `2030-01-01T00:0${minute}:00Z`
          )
        );
      }
      const page = (limit: number, offset: number) =>
        repositories.messages.findPages([chat.id], { limit, offset });

      expect(await page(2, 0)).toEqual(sent.slice(3, 5));
      expect(await page(2, 2)).toEqual(sent.slice(1, 3));
      expect(await page(2, 4)).toEqual(sent.slice(0, 1));
      expect(await page(2, 6)).toEqual([]);
    });

    it('pages many chats in one call', async () => {
      const ada = await fixtures.user({ name: 'Ada' });
      const grace = await fixtures.user({ name: 'Grace' });
      const first = await fixtures.groupChat('First', [ada, grace]);
      const second = await fixtures.groupChat('Second', [ada, grace]);
      await send(first, ada, 'old', '2030-01-01T00:00:00Z');
      const firstLatest = await send(
        first,
        grace,
        'new',
        '2030-01-02T00:00:00Z'
      );
      const secondLatest = await send(
        second,
        ada,
        'only',
        '2030-01-03T00:00:00Z'
      );

      const latest = await repositories.messages.findPages(
        [first.id, second.id, ChatId('missing')],
        { limit: 1, offset: 0 }
      );

      expect(sortById(latest)).toEqual(sortById([firstLatest, secondLatest]));
      expect(
        await repositories.messages.findPages([], { limit: 1, offset: 0 })
      ).toEqual([]);
    });
  });
}

/** Email the same way every fixture adapter derives one from a name. */
export const fixtureEmail = (name: string) =>
  `${name.toLowerCase().replace(/\W+/g, '.')}@example.com`;

const sortById = <T extends { readonly id: string }>(values: readonly T[]) =>
  [...values].sort((a, b) => (a.id < b.id ? -1 : 1));

function email(raw: string) {
  const parsed = Email.parse(raw);
  if (!parsed.ok) throw new Error(raw);
  return parsed.value;
}

function term(raw: string) {
  const parsed = SearchTerm.parse(raw);
  if (!parsed.ok) throw new Error(raw);
  return parsed.value;
}
