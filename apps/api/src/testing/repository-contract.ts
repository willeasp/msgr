import { beforeEach, describe, expect, it } from 'vitest';
import type { Repositories } from '../application/ports.js';
import {
  ChatId,
  directPair,
  type ChannelName,
  type Chat,
  type GroupChat,
} from '../domain/chat.js';
import { newInvite, type InviteCode } from '../domain/invite.js';
import {
  MessageId,
  type Message,
  type MessageContent,
  type NewMessage,
} from '../domain/message.js';
import type { PushSubscription } from '../domain/push.js';
import { UNREAD_LIMIT, type Read, type UnreadTotal } from '../domain/read.js';
import { exampleMovie } from './movies.js';
import { exampleSound } from './sounds.js';
import { exampleAvatar, examplePicture } from './pictures.js';
import {
  Email,
  SearchTerm,
  UserId,
  type DisplayName,
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

  /** The newest `limit` of a history, `offset` back. */
  const newest = (limit: number, offset = 0) =>
    ({ limit, kind: 'newest', offset } as const);

  /** What `append` stored: a test that expects it stored fails here if it wasn't. */
  const stored = (message: Message | null): Message => {
    if (!message) throw new Error('Nothing stored');
    return message;
  };

  /** Appends a message the test expects stored. */
  const appended = (message: NewMessage) =>
    repositories.messages.append(message).then(stored);

  const send = (chat: Chat, sender: User, content: string, createdAt: string) =>
    repositories.messages
      .append({
        chatId: chat.id,
        senderId: sender.id,
        content: content as MessageContent,
        picture: null,
        movie: null,
        sound: null,
        createdAt: new Date(createdAt),
      })
      .then(stored);

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

    it('saves a profile: a new name, and a picture or none', async () => {
      const ada = await fixtures.user({ name: 'Ada' });
      const avatar = exampleAvatar();

      const saved = await repositories.users.saveProfile(ada.id, {
        name: 'Countess' as DisplayName,
        avatar,
      });

      expect(saved).toEqual({ ...ada, name: 'Countess', avatar });
      expect(await repositories.users.findByIds([ada.id])).toEqual([saved]);
      expect(
        await repositories.users.saveProfile(ada.id, {
          name: 'Countess' as DisplayName,
          avatar: null,
        })
      ).toEqual({ ...ada, name: 'Countess', avatar: null });
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

  describe('channels', () => {
    const channel = (name: string) => name as ChannelName;

    it('creates a channel on first join and adds whoever joins after', async () => {
      const ada = await fixtures.user({ name: 'Ada' });
      const grace = await fixtures.user({ name: 'Grace' });

      const created = await repositories.chats.joinChannel(
        channel('general'),
        ada.id
      );
      const joined = await repositories.chats.joinChannel(
        channel('general'),
        grace.id
      );
      const again = await repositories.chats.joinChannel(
        channel('general'),
        grace.id
      );

      expect(created).toEqual({
        kind: 'channel',
        id: created.id,
        name: 'general',
        participantIds: [ada.id],
      });
      expect(joined).toEqual({
        ...created,
        participantIds: [ada.id, grace.id].sort(),
      });
      expect(again).toEqual(joined);
      expect(await repositories.chats.findByIds([created.id])).toEqual([
        joined,
      ]);
    });

    it('lists every channel by name, joined or not', async () => {
      const ada = await fixtures.user({ name: 'Ada' });
      const grace = await fixtures.user({ name: 'Grace' });
      const random = await repositories.chats.joinChannel(
        channel('random'),
        ada.id
      );
      const books = await repositories.chats.joinChannel(
        channel('books'),
        grace.id
      );
      await fixtures.groupChat('Not a channel', [ada, grace]);

      expect(await repositories.chats.findChannels()).toEqual([books, random]);
    });

    it('lets a member leave, and leaving twice changes nothing', async () => {
      const ada = await fixtures.user({ name: 'Ada' });
      const grace = await fixtures.user({ name: 'Grace' });
      await repositories.chats.joinChannel(channel('general'), ada.id);
      const general = await repositories.chats.joinChannel(
        channel('general'),
        grace.id
      );

      await repositories.chats.leaveChannel(general.id, grace.id);
      await repositories.chats.leaveChannel(general.id, grace.id);

      expect(await repositories.chats.findByIds([general.id])).toEqual([
        { ...general, participantIds: [ada.id] },
      ]);
      expect(await repositories.chats.findByParticipant(grace.id)).toEqual([]);
    });

    it('does not count joining or leaving as activity', async () => {
      const ada = await fixtures.user({ name: 'Ada' });
      const grace = await fixtures.user({ name: 'Grace' });
      const general = await repositories.chats.joinChannel(
        channel('general'),
        ada.id
      );
      const group = await fixtures.groupChat('Group', [ada, grace]);
      await send(group, ada, 'ping', '2030-01-01T00:00:00Z');

      await repositories.chats.joinChannel(channel('general'), grace.id);
      await repositories.chats.leaveChannel(general.id, grace.id);

      expect(
        (await repositories.chats.findByParticipant(ada.id)).map(({ id }) => id)
      ).toEqual([group.id, general.id]);
    });
  });

  describe('invites', () => {
    const now = new Date('2030-01-01T00:00:00.000Z');
    const later = (days: number) =>
      new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    const code = (n: number) =>
      `invite-code-${n}`.padEnd(22, '0') as InviteCode;
    const newcomer = (name: string) => ({
      email: email(fixtureEmail(name)),
      name: name as DisplayName,
      passwordHash: `hash-of-${name}` as PasswordHash,
    });

    it('spends an invite once, on the user it creates', async () => {
      const ada = await fixtures.user({ name: 'Ada' });
      await repositories.invites.create(newInvite(code(1), ada.id, now));

      const grace = await repositories.invites.redeem(
        code(1),
        newcomer('Grace'),
        later(1)
      );
      const again = await repositories.invites.redeem(
        code(1),
        newcomer('Linus'),
        later(1)
      );

      if (!grace.ok) throw new Error(grace.error);
      expect(grace.value).toEqual({
        user: {
          id: grace.value.user.id,
          email: 'grace@example.com',
          name: 'Grace',
          avatar: null,
        },
        invitedBy: ada.id,
      });
      expect(
        await repositories.users.findCredentials(email('grace@example.com'))
      ).toEqual({ user: grace.value.user, passwordHash: 'hash-of-Grace' });
      expect(again).toEqual({ ok: false, error: 'InviteUnavailable' });
      expect(
        await repositories.users.findCredentials(email('linus@example.com'))
      ).toBeNull();
      expect(await repositories.invites.isRedeemable(code(1), later(1))).toBe(
        false
      );
    });

    it('says nobody sent an invite made from the command line', async () => {
      await repositories.invites.create(newInvite(code(5), null, now));

      const first = await repositories.invites.redeem(
        code(5),
        newcomer('Ada'),
        later(1)
      );

      expect(first).toMatchObject({ ok: true, value: { invitedBy: null } });
    });

    it('refuses an expired or unknown invite', async () => {
      await repositories.invites.create(newInvite(code(2), null, now));

      expect(await repositories.invites.isRedeemable(code(2), later(6))).toBe(
        true
      );
      expect(await repositories.invites.isRedeemable(code(2), later(8))).toBe(
        false
      );
      expect(
        await repositories.invites.redeem(code(2), newcomer('Ada'), later(8))
      ).toEqual({ ok: false, error: 'InviteUnavailable' });
      expect(
        await repositories.invites.redeem(code(3), newcomer('Ada'), later(1))
      ).toEqual({ ok: false, error: 'InviteUnavailable' });
    });

    it('leaves the invite unspent when its email is already taken', async () => {
      await fixtures.user({ name: 'Ada' });
      await repositories.invites.create(newInvite(code(4), null, now));

      expect(
        await repositories.invites.redeem(code(4), newcomer('Ada'), later(1))
      ).toEqual({ ok: false, error: 'EmailTaken' });
      expect(await repositories.invites.isRedeemable(code(4), later(1))).toBe(
        true
      );
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
        repositories.messages.findPages([chat.id], newest(limit, offset));

      expect(await page(2, 0)).toEqual(sent.slice(3, 5));
      expect(await page(2, 2)).toEqual(sent.slice(1, 3));
      expect(await page(2, 4)).toEqual(sent.slice(0, 1));
      expect(await page(2, 6)).toEqual([]);
    });

    it('stores a message under the id its sender chose, or one of its own', async () => {
      const ada = await fixtures.user({ name: 'Ada' });
      const grace = await fixtures.user({ name: 'Grace' });
      const chat = await repositories.chats.saveDirect(pairOf(ada, grace));
      const chosen = MessageId('3f0e1c2a-9b4d-4c8e-a1f2-0123456789ab');
      const message = stored(
        await repositories.messages.append({
          id: chosen,
          chatId: chat.id,
          senderId: ada.id,
          content: 'mine' as MessageContent,
          picture: null,
          movie: null,
          sound: null,
          createdAt: new Date('2030-01-01T00:00:00Z'),
        })
      );
      const theirs = await send(chat, grace, 'theirs', '2030-01-01T00:01:00Z');

      expect(message.id).toBe(chosen);
      expect(theirs.id).not.toBe(chosen);
      expect(await repositories.messages.findByIds([chosen])).toEqual([
        message,
      ]);
    });

    it('says so when the id a sender chose is taken, storing nothing', async () => {
      const ada = await fixtures.user({ name: 'Ada' });
      const grace = await fixtures.user({ name: 'Grace' });
      const chat = await repositories.chats.saveDirect(pairOf(ada, grace));
      const id = MessageId('3f0e1c2a-9b4d-4c8e-a1f2-0123456789ab');
      const append = (content: string) =>
        repositories.messages.append({
          id,
          chatId: chat.id,
          senderId: ada.id,
          content: content as MessageContent,
          picture: null,
          movie: null,
          sound: null,
          createdAt: new Date('2030-01-01T00:00:00Z'),
        });

      const first = stored(await append('first'));

      expect(await append('again')).toBeNull();
      expect(
        await repositories.messages.findPages([chat.id], newest(5))
      ).toEqual([first]);
    });

    it('stores pictures, alone or with text, and reads them back unchanged', async () => {
      const ada = await fixtures.user({ name: 'Ada' });
      const grace = await fixtures.user({ name: 'Grace' });
      const chat = await repositories.chats.saveDirect(pairOf(ada, grace));
      const text = await send(chat, ada, 'look', '2030-01-01T00:00:00Z');
      const alone = await appended({
        chatId: chat.id,
        senderId: grace.id,
        content: null,
        picture: examplePicture(256, 160),
        movie: null,
        sound: null,
        createdAt: new Date('2030-01-01T00:01:00Z'),
      });
      const captioned = await appended({
        chatId: chat.id,
        senderId: ada.id,
        content: 'a tall one' as MessageContent,
        picture: examplePicture(9, 320, 319),
        movie: null,
        sound: null,
        createdAt: new Date('2030-01-01T00:02:00Z'),
      });

      // Kept with their sizes; their bytes come on their own.
      expect(alone).toMatchObject({
        content: null,
        picture: { width: 256, height: 160 },
      });
      expect(captioned.picture).toEqual({ width: 9, height: 320 });
      expect(
        await repositories.messages.findPages([chat.id], newest(5))
      ).toEqual([text, alone, captioned]);
      expect(
        await repositories.messages.findMedia([captioned.id, text.id])
      ).toEqual([
        {
          messageId: captioned.id,
          part: 'picture',
          bytes: examplePicture(9, 320, 319).deflated,
        },
      ]);
    });

    it('stores movies, alone or with text, and reads them back unchanged', async () => {
      const ada = await fixtures.user({ name: 'Ada' });
      const grace = await fixtures.user({ name: 'Grace' });
      const chat = await repositories.chats.saveDirect(pairOf(ada, grace));
      const alone = await appended({
        chatId: chat.id,
        senderId: grace.id,
        content: null,
        picture: null,
        movie: exampleMovie(320, 180, 48),
        sound: null,
        createdAt: new Date('2030-01-01T00:01:00Z'),
      });
      const captioned = await appended({
        chatId: chat.id,
        senderId: ada.id,
        content: 'a short one' as MessageContent,
        picture: null,
        movie: exampleMovie(9, 320, 1),
        sound: null,
        createdAt: new Date('2030-01-01T00:02:00Z'),
      });

      expect(alone).toMatchObject({
        content: null,
        picture: null,
        movie: { width: 320, height: 180, frames: 48 },
      });
      expect(captioned.movie).toEqual({ width: 9, height: 320, frames: 1 });
      expect(
        await repositories.messages.findPages([chat.id], newest(5))
      ).toEqual([alone, captioned]);
      expect(
        sortByMessage(
          await repositories.messages.findMedia([alone.id, captioned.id])
        )
      ).toEqual(
        sortByMessage([
          {
            messageId: alone.id,
            part: 'movie',
            bytes: exampleMovie(320, 180, 48).coded,
          },
          {
            messageId: captioned.id,
            part: 'movie',
            bytes: exampleMovie(9, 320, 1).coded,
          },
        ])
      );
    });

    it('stores sounds, alone or with text, and reads them back unchanged', async () => {
      const ada = await fixtures.user({ name: 'Ada' });
      const grace = await fixtures.user({ name: 'Grace' });
      const chat = await repositories.chats.saveDirect(pairOf(ada, grace));
      const alone = await appended({
        chatId: chat.id,
        senderId: grace.id,
        content: null,
        picture: null,
        movie: null,
        sound: exampleSound(60),
        createdAt: new Date('2030-01-01T00:01:00Z'),
      });
      const captioned = await appended({
        chatId: chat.id,
        senderId: ada.id,
        content: 'a short one' as MessageContent,
        picture: null,
        movie: null,
        sound: exampleSound(0.02, 220),
        createdAt: new Date('2030-01-01T00:02:00Z'),
      });

      expect(alone).toMatchObject({
        content: null,
        picture: null,
        movie: null,
        sound: { frames: 3001 },
      });
      expect(captioned.sound).toEqual({
        frames: exampleSound(0.02, 220).frames,
      });
      expect(
        await repositories.messages.findPages([chat.id], newest(5))
      ).toEqual([alone, captioned]);
      expect(
        sortByMessage(
          await repositories.messages.findMedia([alone.id, captioned.id])
        )
      ).toEqual(
        sortByMessage([
          { messageId: alone.id, part: 'sound', bytes: exampleSound(60).coded },
          {
            messageId: captioned.id,
            part: 'sound',
            bytes: exampleSound(0.02, 220).coded,
          },
        ])
      );
    });

    it('finds messages by id, with and without pictures, movies and sounds, and skips unknown ids', async () => {
      const ada = await fixtures.user({ name: 'Ada' });
      const grace = await fixtures.user({ name: 'Grace' });
      const chat = await repositories.chats.saveDirect(pairOf(ada, grace));
      const text = await send(chat, ada, 'hi', '2030-01-01T00:00:00Z');
      const picture = await appended({
        chatId: chat.id,
        senderId: grace.id,
        content: null,
        picture: examplePicture(),
        movie: null,
        sound: null,
        createdAt: new Date('2030-01-01T00:01:00Z'),
      });
      const movie = await appended({
        chatId: chat.id,
        senderId: ada.id,
        content: null,
        picture: null,
        movie: exampleMovie(),
        sound: null,
        createdAt: new Date('2030-01-01T00:02:00Z'),
      });
      const sound = await appended({
        chatId: chat.id,
        senderId: grace.id,
        content: null,
        picture: null,
        movie: null,
        sound: exampleSound(),
        createdAt: new Date('2030-01-01T00:03:00Z'),
      });

      const found = await repositories.messages.findByIds([
        picture.id,
        movie.id,
        sound.id,
        text.id,
        MessageId('missing'),
      ]);

      expect(sortById(found)).toEqual(sortById([text, picture, movie, sound]));
      expect(await repositories.messages.findByIds([])).toEqual([]);
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
        [first.id, second.id, ChatId('missing'), first.id],
        newest(1)
      );

      expect(sortById(latest)).toEqual(sortById([firstLatest, secondLatest]));
      expect(await repositories.messages.findPages([], newest(1))).toEqual([]);
    });

    it('pages back from a message, and forward from one to the newest', async () => {
      const ada = await fixtures.user({ name: 'Ada' });
      const grace = await fixtures.user({ name: 'Grace' });
      const chat = await repositories.chats.saveDirect(pairOf(ada, grace));
      const sent: Message[] = [];
      for (let minute = 1; minute <= 6; minute++) {
        sent.push(
          await send(chat, ada, `#${minute}`, `2030-01-01T00:0${minute}:00Z`)
        );
      }
      const [first, , third, fourth, , sixth] = sent as [
        Message,
        Message,
        Message,
        Message,
        Message,
        Message
      ];
      const page = (kind: 'before' | 'after', cursor: MessageId) =>
        repositories.messages.findPages([chat.id], { limit: 2, kind, cursor });

      expect(await page('before', fourth.id)).toEqual(sent.slice(1, 3));
      expect(await page('before', first.id)).toEqual([]);
      // Forward, the newest two after it: a gap means start again.
      expect(await page('after', third.id)).toEqual(sent.slice(4, 6));
      expect(await page('after', sixth.id)).toEqual([]);
    });

    it("finds nothing from a cursor that isn't one of the chat's messages", async () => {
      const ada = await fixtures.user({ name: 'Ada' });
      const grace = await fixtures.user({ name: 'Grace' });
      const ours = await repositories.chats.saveDirect(pairOf(ada, grace));
      const theirs = await fixtures.groupChat('Theirs', [grace]);
      await send(ours, ada, 'early', '2030-01-01T00:00:00Z');
      const elsewhere = await send(
        theirs,
        grace,
        'between',
        '2030-01-01T00:01:00Z'
      );
      await send(ours, ada, 'late', '2030-01-01T00:02:00Z');

      for (const cursor of [elsewhere.id, MessageId('missing')]) {
        for (const kind of ['before', 'after'] as const) {
          expect(
            await repositories.messages.findPages([ours.id], {
              limit: 5,
              kind,
              cursor,
            })
          ).toEqual([]);
        }
      }
    });

    it('finds media only for messages that have it, and skips unknown ids', async () => {
      const ada = await fixtures.user({ name: 'Ada' });
      const grace = await fixtures.user({ name: 'Grace' });
      const chat = await repositories.chats.saveDirect(pairOf(ada, grace));
      const text = await send(chat, ada, 'hi', '2030-01-01T00:00:00Z');

      expect(
        await repositories.messages.findMedia([text.id, MessageId('missing')])
      ).toEqual([]);
      expect(await repositories.messages.findMedia([])).toEqual([]);
    });
  });

  describe('reads', () => {
    const at = (minute: number) =>
      new Date(`2030-01-02T00:${String(minute).padStart(2, '0')}:00Z`);
    const byReader = (found: readonly Read[]) =>
      [...found].sort(
        (a, b) =>
          (a.messageId < b.messageId
            ? -1
            : a.messageId > b.messageId
            ? 1
            : 0) || (a.readerId < b.readerId ? -1 : 1)
      );

    it('reads every message up to the one read, each when it was first read', async () => {
      const ada = await fixtures.user({ name: 'Ada' });
      const grace = await fixtures.user({ name: 'Grace' });
      const linus = await fixtures.user({ name: 'Linus' });
      const team = await fixtures.groupChat('Team', [ada, grace, linus]);
      const first = await send(team, ada, 'one', '2030-01-01T00:01:00Z');
      const second = await send(team, ada, 'two', '2030-01-01T00:02:00Z');
      const third = await send(team, grace, 'three', '2030-01-01T00:03:00Z');

      await repositories.reads.markRead(first, grace.id, at(1));
      await repositories.reads.markRead(second, grace.id, at(2));
      // Reading back over what's been read already changes nothing.
      await repositories.reads.markRead(first, grace.id, at(3));
      await repositories.reads.markRead(third, linus.id, at(4));

      expect(
        byReader(
          await repositories.reads.findByMessageIds([
            first.id,
            second.id,
            third.id,
          ])
        )
      ).toEqual(
        byReader([
          { messageId: first.id, readerId: grace.id, at: at(1) },
          { messageId: first.id, readerId: linus.id, at: at(4) },
          { messageId: second.id, readerId: grace.id, at: at(2) },
          { messageId: second.id, readerId: linus.id, at: at(4) },
          { messageId: third.id, readerId: linus.id, at: at(4) },
        ])
      );
    });

    it('never counts the sender, nor reading another chat', async () => {
      const ada = await fixtures.user({ name: 'Ada' });
      const grace = await fixtures.user({ name: 'Grace' });
      const direct = await repositories.chats.saveDirect(pairOf(ada, grace));
      const team = await fixtures.groupChat('Team', [ada, grace]);
      const hello = await send(direct, ada, 'hello', '2030-01-01T00:01:00Z');
      const later = await send(team, grace, 'later', '2030-01-01T00:02:00Z');

      await repositories.reads.markRead(hello, ada.id, at(1));
      await repositories.reads.markRead(later, ada.id, at(2));
      await repositories.reads.markRead(later, grace.id, at(3));

      expect(await repositories.reads.findByMessageIds([hello.id])).toEqual([]);
      expect(
        await repositories.reads.findByMessageIds([
          later.id,
          MessageId('missing'),
        ])
      ).toEqual([{ messageId: later.id, readerId: ada.id, at: at(2) }]);
      expect(await repositories.reads.findByMessageIds([])).toEqual([]);
    });

    it('orders messages sent at the same moment by id, as pages do', async () => {
      const ada = await fixtures.user({ name: 'Ada' });
      const grace = await fixtures.user({ name: 'Grace' });
      const direct = await repositories.chats.saveDirect(pairOf(ada, grace));
      const [earlier, later] = sortById([
        await send(direct, ada, 'a', '2030-01-01T00:01:00Z'),
        await send(direct, ada, 'b', '2030-01-01T00:01:00Z'),
      ]) as [Message, Message];

      await repositories.reads.markRead(earlier, grace.id, at(1));

      expect(
        await repositories.reads.findByMessageIds([earlier.id, later.id])
      ).toEqual([{ messageId: earlier.id, readerId: grace.id, at: at(1) }]);
    });

    it('counts what others sent after the last message read, or sent', async () => {
      const ada = await fixtures.user({ name: 'Ada' });
      const grace = await fixtures.user({ name: 'Grace' });
      const linus = await fixtures.user({ name: 'Linus' });
      const team = await fixtures.groupChat('Team', [ada, grace, linus]);
      const unread = (reader: User) =>
        repositories.reads.countUnread(reader.id, [team.id]);
      await send(team, ada, 'one', '2030-01-01T00:01:00Z');
      await send(team, ada, 'two', '2030-01-01T00:02:00Z');

      // Nothing read: everyone else's messages.
      expect(await unread(linus)).toEqual([{ chatId: team.id, count: 2 }]);
      // Sending reads what came before it.
      await send(team, grace, 'three', '2030-01-01T00:03:00Z');
      const four = await send(team, ada, 'four', '2030-01-01T00:04:00Z');
      const five = await send(team, linus, 'five', '2030-01-01T00:05:00Z');
      expect(await unread(grace)).toEqual([{ chatId: team.id, count: 2 }]);
      expect(await unread(ada)).toEqual([{ chatId: team.id, count: 1 }]);
      // Nothing after their own: left out.
      expect(await unread(linus)).toEqual([]);

      await repositories.reads.markRead(four, grace.id, at(1));
      expect(await unread(grace)).toEqual([{ chatId: team.id, count: 1 }]);
      await repositories.reads.markRead(five, grace.id, at(2));
      expect(await unread(grace)).toEqual([]);
      // Reading back over what's been read changes nothing.
      await repositories.reads.markRead(four, grace.id, at(3));
      expect(await unread(grace)).toEqual([]);
    });

    it('counts each chat on its own, leaving out unknown chats', async () => {
      const ada = await fixtures.user({ name: 'Ada' });
      const grace = await fixtures.user({ name: 'Grace' });
      const linus = await fixtures.user({ name: 'Linus' });
      const direct = await repositories.chats.saveDirect(pairOf(ada, grace));
      const team = await fixtures.groupChat('Team', [ada, grace, linus]);
      const quiet = await fixtures.groupChat('Quiet', [ada, grace]);
      await send(direct, ada, 'hi', '2030-01-01T00:01:00Z');
      await send(direct, ada, 'there', '2030-01-01T00:02:00Z');
      const news = await send(team, linus, 'news', '2030-01-01T00:03:00Z');
      // Reading one chat reads nothing in another.
      await repositories.reads.markRead(news, grace.id, at(1));

      const found = await repositories.reads.countUnread(grace.id, [
        direct.id,
        team.id,
        quiet.id,
        ChatId('missing'),
        direct.id,
      ]);
      expect(found).toEqual([{ chatId: direct.id, count: 2 }]);
      expect(await repositories.reads.countUnread(grace.id, [])).toEqual([]);
    });

    it('counts messages sent at the same moment in id order, as pages do', async () => {
      const ada = await fixtures.user({ name: 'Ada' });
      const grace = await fixtures.user({ name: 'Grace' });
      const direct = await repositories.chats.saveDirect(pairOf(ada, grace));
      const [earlier] = sortById([
        await send(direct, ada, 'a', '2030-01-01T00:01:00Z'),
        await send(direct, ada, 'b', '2030-01-01T00:01:00Z'),
      ]) as [Message, Message];

      await repositories.reads.markRead(earlier, grace.id, at(1));

      expect(
        await repositories.reads.countUnread(grace.id, [direct.id])
      ).toEqual([{ chatId: direct.id, count: 1 }]);
    });

    it('counts from their own last message when they read less far', async () => {
      const ada = await fixtures.user({ name: 'Ada' });
      const grace = await fixtures.user({ name: 'Grace' });
      const direct = await repositories.chats.saveDirect(pairOf(ada, grace));
      const first = await send(direct, ada, 'one', '2030-01-01T00:01:00Z');
      await send(direct, ada, 'two', '2030-01-01T00:02:00Z');
      await repositories.reads.markRead(first, grace.id, at(1));
      await send(direct, grace, 'reply', '2030-01-01T00:03:00Z');
      await send(direct, ada, 'three', '2030-01-01T00:04:00Z');

      expect(
        await repositories.reads.countUnread(grace.id, [direct.id])
      ).toEqual([{ chatId: direct.id, count: 1 }]);
    });

    it('orders their own last message among others at the same moment by id', async () => {
      const ada = await fixtures.user({ name: 'Ada' });
      const grace = await fixtures.user({ name: 'Grace' });
      const direct = await repositories.chats.saveDirect(pairOf(ada, grace));
      const moment = '2030-01-01T00:01:00Z';
      const sent = sortById([
        await send(direct, ada, 'a', moment),
        await send(direct, grace, 'b', moment),
        await send(direct, ada, 'c', moment),
        await send(direct, ada, 'd', moment),
      ]);
      const own = sent.findIndex((message) => message.senderId === grace.id);

      expect(
        await repositories.reads.countUnread(grace.id, [direct.id])
      ).toEqual(
        own === sent.length - 1
          ? []
          : [{ chatId: direct.id, count: sent.length - 1 - own }]
      );
    });

    it(`counts no further than ${UNREAD_LIMIT}`, async () => {
      const ada = await fixtures.user({ name: 'Ada' });
      const grace = await fixtures.user({ name: 'Grace' });
      const direct = await repositories.chats.saveDirect(pairOf(ada, grace));
      for (let i = 0; i < UNREAD_LIMIT + 5; i++) {
        const second = String(i % 60).padStart(2, '0');
        const minute = String(Math.floor(i / 60)).padStart(2, '0');
        await send(direct, ada, `${i}`, `2030-01-01T00:${minute}:${second}Z`);
      }

      expect(
        await repositories.reads.countUnread(grace.id, [direct.id])
      ).toEqual([{ chatId: direct.id, count: UNREAD_LIMIT }]);
      expect(await repositories.reads.countAllUnread([grace.id])).toEqual([
        { readerId: grace.id, total: UNREAD_LIMIT },
      ]);
    });

    it('starts a newcomer just before the newest message, and keeps anyone’s place', async () => {
      const ada = await fixtures.user({ name: 'Ada' });
      const grace = await fixtures.user({ name: 'Grace' });
      const linus = await fixtures.user({ name: 'Linus' });
      const team = await fixtures.groupChat('Team', [ada, grace, linus]);
      const first = await send(team, ada, 'one', '2030-01-01T00:01:00Z');
      await send(team, ada, 'two', '2030-01-01T00:02:00Z');
      const newest = await send(team, ada, 'three', '2030-01-01T00:03:00Z');
      await repositories.reads.markRead(first, linus.id, at(1));
      const unread = async (reader: User) =>
        (await repositories.reads.countUnread(reader.id, [team.id]))[0]
          ?.count ?? 0;

      await repositories.reads.startReading(team.id, [
        grace.id,
        linus.id,
        grace.id,
      ]);

      expect(await unread(grace)).toBe(1);
      expect(await unread(linus)).toBe(2);
      // Nothing was marked read by starting.
      expect(await repositories.reads.findByMessageIds([first.id])).toEqual([
        { messageId: first.id, readerId: linus.id, at: at(1) },
      ]);
      // Reading the newest counts, as any read does.
      await repositories.reads.markRead(newest, grace.id, at(2));
      expect(await unread(grace)).toBe(0);
      expect(
        await repositories.reads.findByMessageIds([newest.id])
      ).toContainEqual({ messageId: newest.id, readerId: grace.id, at: at(2) });
    });

    it('starts no one in a chat with one message or none', async () => {
      const ada = await fixtures.user({ name: 'Ada' });
      const grace = await fixtures.user({ name: 'Grace' });
      const team = await fixtures.groupChat('Team', [ada, grace]);
      await repositories.reads.startReading(team.id, [grace.id]);
      await repositories.reads.startReading(team.id, []);
      await send(team, ada, 'one', '2030-01-01T00:01:00Z');
      await repositories.reads.startReading(team.id, [grace.id]);

      expect(await repositories.reads.countUnread(grace.id, [team.id])).toEqual(
        [{ chatId: team.id, count: 1 }]
      );
    });

    it('sums only the chats a reader is still in', async () => {
      const ada = await fixtures.user({ name: 'Ada' });
      const grace = await fixtures.user({ name: 'Grace' });
      const books = await repositories.chats.joinChannel(
        'books' as ChannelName,
        ada.id
      );
      await repositories.chats.joinChannel('books' as ChannelName, grace.id);
      const first = await send(books, ada, 'one', '2030-01-01T00:01:00Z');
      await send(books, ada, 'two', '2030-01-01T00:02:00Z');
      await repositories.reads.markRead(first, grace.id, at(1));
      expect(await repositories.reads.countAllUnread([grace.id])).toEqual([
        { readerId: grace.id, total: 1 },
      ]);

      await repositories.chats.leaveChannel(books.id, grace.id);

      expect(await repositories.reads.countAllUnread([grace.id])).toEqual([]);
    });

    it('sums every chat each reader is in, and no one else’s', async () => {
      const ada = await fixtures.user({ name: 'Ada' });
      const grace = await fixtures.user({ name: 'Grace' });
      const linus = await fixtures.user({ name: 'Linus' });
      const direct = await repositories.chats.saveDirect(pairOf(ada, grace));
      const team = await fixtures.groupChat('Team', [ada, grace, linus]);
      const theirs = await fixtures.groupChat('Theirs', [ada, linus]);
      await send(direct, ada, 'hi', '2030-01-01T00:01:00Z');
      await send(direct, ada, 'there', '2030-01-01T00:02:00Z');
      await send(team, linus, 'news', '2030-01-01T00:03:00Z');
      await send(theirs, linus, 'not for Grace', '2030-01-01T00:04:00Z');
      const byReader = (found: readonly UnreadTotal[]) =>
        [...found].sort((a, b) => (a.readerId < b.readerId ? -1 : 1));

      expect(
        byReader(
          await repositories.reads.countAllUnread([
            grace.id,
            ada.id,
            linus.id,
            UserId('missing'),
          ])
        )
      ).toEqual(
        byReader([
          { readerId: grace.id, total: 3 },
          { readerId: ada.id, total: 2 },
        ])
      );
      expect(await repositories.reads.countAllUnread([])).toEqual([]);
    });
  });

  describe('push subscriptions', () => {
    const browser = (name: string, key = 'a') =>
      ({
        endpoint: `https://fcm.googleapis.com/fcm/send/${name}`,
        p256dh: key.repeat(87),
        auth: key.repeat(22),
      } as PushSubscription);
    const byEndpoint = <T extends { readonly subscription: PushSubscription }>(
      found: readonly T[]
    ) =>
      [...found].sort((a, b) =>
        a.subscription.endpoint < b.subscription.endpoint ? -1 : 1
      );

    it("finds people's browsers by user, skipping everyone else's", async () => {
      const ada = await fixtures.user({ name: 'Ada' });
      const grace = await fixtures.user({ name: 'Grace' });
      const linus = await fixtures.user({ name: 'Linus' });
      const push = repositories.pushSubscriptions;
      await push.save(ada.id, browser('ada-phone'));
      await push.save(ada.id, browser('ada-laptop'));
      await push.save(grace.id, browser('grace-phone'));
      await push.save(linus.id, browser('linus-phone'));

      const found = await push.findByUserIds([
        ada.id,
        grace.id,
        UserId('missing'),
      ]);

      expect(byEndpoint(found)).toEqual(
        byEndpoint([
          { userId: ada.id, subscription: browser('ada-phone') },
          { userId: ada.id, subscription: browser('ada-laptop') },
          { userId: grace.id, subscription: browser('grace-phone') },
        ])
      );
      expect(await push.findByUserIds([])).toEqual([]);
    });

    it('moves a browser to whoever registers it last, with its newest keys', async () => {
      const ada = await fixtures.user({ name: 'Ada' });
      const grace = await fixtures.user({ name: 'Grace' });
      const push = repositories.pushSubscriptions;
      await push.save(ada.id, browser('shared'));
      await push.save(grace.id, browser('shared', 'b'));

      expect(await push.findByUserIds([ada.id, grace.id])).toEqual([
        { userId: grace.id, subscription: browser('shared', 'b') },
      ]);
    });

    it('forgets a browser only for the user it notifies', async () => {
      const ada = await fixtures.user({ name: 'Ada' });
      const grace = await fixtures.user({ name: 'Grace' });
      const push = repositories.pushSubscriptions;
      await push.save(ada.id, browser('ada-phone'));

      await push.remove(browser('ada-phone').endpoint, grace.id);
      expect(await push.findByUserIds([ada.id])).toHaveLength(1);

      await push.remove(browser('ada-phone').endpoint, ada.id);
      await push.remove(browser('ada-phone').endpoint, ada.id);
      expect(await push.findByUserIds([ada.id])).toEqual([]);
    });
  });
}

/** Email the same way every fixture adapter derives one from a name. */
export const fixtureEmail = (name: string) =>
  `${name.toLowerCase().replace(/\W+/g, '.')}@example.com`;

const sortByMessage = <T extends { readonly messageId: string }>(
  values: readonly T[]
) =>
  [...values].sort((a, b) =>
    a.messageId < b.messageId ? -1 : a.messageId > b.messageId ? 1 : 0
  );

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
