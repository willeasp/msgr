import { describe, expect, it } from 'vitest';
import {
  unreadLabel,
  withChat,
  withMessage,
  withReceivedMessage,
  type ChatRow,
  type ReceivedMessage,
  type Receiver,
} from './chat-list';
import { ChatKind } from './__generated__/graphql';

const row = (id: string, preview: string, unreadCount = 0): ChatRow => ({
  id,
  kind: ChatKind.Direct,
  title: `Chat ${id}`,
  unreadCount,
  participants: [],
  messages: [{ id: `${id}-old`, content: preview, createdAt: '2026-01-01' }],
});

// The viewer, with the chat elsewhere: not on screen, or the page hidden.
const away: Receiver = { viewerId: 'me', reading: false };

const received = (chatId: string, content: string): ReceivedMessage => ({
  id: `${chatId}-new`,
  content,
  createdAt: '2026-01-02',
  sender: { id: 'bob', name: 'Bob' },
  chat: {
    id: chatId,
    kind: ChatKind.Direct,
    title: 'Bob',
    participants: [{ id: 'bob', name: 'Bob' }],
  },
});

describe('withReceivedMessage', () => {
  it('adds a chat the list has never seen, on top', () => {
    const existing = row('a', 'earlier');

    expect(
      withReceivedMessage([existing], received('new', 'hi alice'), away)
    ).toEqual([
      {
        id: 'new',
        kind: ChatKind.Direct,
        title: 'Bob',
        participants: [{ id: 'bob', name: 'Bob' }],
        unreadCount: 1,
        messages: [
          { id: 'new-new', content: 'hi alice', createdAt: '2026-01-02' },
        ],
      },
      existing,
    ]);
  });

  it('moves a known chat to the top with the message as its preview', () => {
    const chats = [row('a', 'x'), row('b', 'y'), row('c', 'z')];

    const next = withReceivedMessage(chats, received('c', 'fresh'), away);

    expect(next.map(({ id }) => id)).toEqual(['c', 'a', 'b']);
    expect(next[0]?.messages).toEqual([
      { id: 'c-new', content: 'fresh', createdAt: '2026-01-02' },
    ]);
  });

  // Your own send's response can land after the feed brought a later message.
  it('previews a movie by its being one, not by its frames', () => {
    const movie = { width: 8, height: 8, frames: 3, url: '/media/a-new/movie' };
    const next = withReceivedMessage(
      [row('a', 'x')],
      { ...received('a', 'unused'), content: null, movie },
      away
    );

    expect(next[0]?.messages).toEqual([
      {
        id: 'a-new',
        content: null,
        movie: { frames: 3 },
        createdAt: '2026-01-02',
      },
    ]);
  });

  it('previews a sound by its being one, not by its address', () => {
    const next = withReceivedMessage(
      [row('a', 'x')],
      {
        ...received('a', 'unused'),
        content: null,
        sound: { frames: 51, url: '/media/a-new/sound' },
      },
      away
    );

    expect(next[0]?.messages).toEqual([
      {
        id: 'a-new',
        content: null,
        sound: { frames: 51 },
        createdAt: '2026-01-02',
      },
    ]);
  });

  it('keeps a later preview when an earlier message arrives after it', () => {
    const chats = [row('a', 'x'), row('b', 'y')];
    const late = { ...received('b', 'stale'), createdAt: '2025-12-31' };

    expect(withReceivedMessage(chats, late, away)).toBe(chats);
  });

  it('counts a late message unread only if what came after it is', () => {
    const late = { ...received('b', 'stale'), createdAt: '2025-12-31' };
    const unread = [row('a', 'x'), row('b', 'y', 2)];

    const next = withReceivedMessage(unread, late, away);
    expect(next.map(({ id, unreadCount }) => [id, unreadCount])).toEqual([
      ['a', 0],
      ['b', 3],
    ]);
    expect(next[1]?.messages).toEqual(unread[1]?.messages);
    expect(
      withReceivedMessage(unread, late, { viewerId: 'me', reading: true })
    ).toBe(unread);
  });

  it("counts someone else's message as unread, on top of those before", () => {
    const next = withReceivedMessage(
      [row('a', 'x', 2), row('b', 'y')],
      received('b', 'hello'),
      away
    );

    expect(next.map(({ id, unreadCount }) => [id, unreadCount])).toEqual([
      ['b', 1],
      ['a', 2],
    ]);
    expect(
      withReceivedMessage([row('a', 'x', 2)], received('a', 'more'), away)[0]
        ?.unreadCount
    ).toBe(3);
  });

  it('counts nothing in the chat being read', () => {
    expect(
      withReceivedMessage([row('a', 'x', 2)], received('a', 'seen'), {
        viewerId: 'me',
        reading: true,
      })[0]?.unreadCount
    ).toBe(0);
  });

  it("reads everything before the viewer's own message", () => {
    const mine = { ...received('a', 'mine'), sender: { id: 'me', name: 'Me' } };

    expect(
      withReceivedMessage([row('a', 'x', 4)], mine, away)[0]?.unreadCount
    ).toBe(0);
    expect(withReceivedMessage([], mine, away)[0]?.unreadCount).toBe(0);
  });

  it('counts a chat new to the list by its one message', () => {
    expect(
      withReceivedMessage([], received('new', 'hi'), away)[0]?.unreadCount
    ).toBe(1);
  });

  // Sent and delivered both arrive: whichever comes second changes nothing.
  it('counts a message once, however often it arrives', () => {
    const once = withReceivedMessage(
      [row('a', 'x')],
      received('a', 'hi'),
      away
    );

    expect(withReceivedMessage(once, received('a', 'hi'), away)).toBe(once);
    expect(once[0]?.unreadCount).toBe(1);
  });
});

describe('unreadLabel', () => {
  it('says how many, up to 99', () => {
    expect(unreadLabel(1)).toBe('1');
    expect(unreadLabel(99)).toBe('99');
    expect(unreadLabel(100)).toBe('99+');
    expect(unreadLabel(5000)).toBe('99+');
  });
});

describe('withMessage', () => {
  const message = (id: string) => ({
    id,
    content: id,
    createdAt: '2026-01-01',
    sender: { id: 'bob', name: 'Bob' },
  });

  it('appends a new message to a chat history', () => {
    expect(withMessage([message('1')], message('2'))).toEqual([
      message('1'),
      message('2'),
    ]);
  });

  it('ignores a message the history already has', () => {
    const history = [message('1'), message('2')];

    expect(withMessage(history, message('2'))).toBe(history);
  });
});

describe('withChat', () => {
  it('puts a chat the list has never seen on top', () => {
    const existing = row('a', 'earlier');
    const added = { ...row('new', 'hello'), messages: [] };

    expect(withChat([existing], added)).toEqual([added, existing]);
  });

  it('leaves the list alone when the chat is already in it', () => {
    const chats = [row('a', 'x'), row('b', 'y')];

    expect(withChat(chats, row('b', 'y'))).toBe(chats);
  });
});
