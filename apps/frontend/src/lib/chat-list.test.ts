import { describe, expect, it } from 'vitest';
import {
  withMessage,
  withReceivedMessage,
  type ChatRow,
  type ReceivedMessage,
} from './chat-list';
import { ChatKind } from './__generated__/graphql';

const row = (id: string, preview: string): ChatRow => ({
  id,
  kind: ChatKind.Direct,
  title: `Chat ${id}`,
  participants: [],
  messages: [{ id: `${id}-old`, content: preview, createdAt: '2026-01-01' }],
});

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
      withReceivedMessage([existing], received('new', 'hi alice'))
    ).toEqual([
      {
        id: 'new',
        kind: ChatKind.Direct,
        title: 'Bob',
        participants: [{ id: 'bob', name: 'Bob' }],
        messages: [
          { id: 'new-new', content: 'hi alice', createdAt: '2026-01-02' },
        ],
      },
      existing,
    ]);
  });

  it('moves a known chat to the top with the message as its preview', () => {
    const chats = [row('a', 'x'), row('b', 'y'), row('c', 'z')];

    const next = withReceivedMessage(chats, received('c', 'fresh'));

    expect(next.map(({ id }) => id)).toEqual(['c', 'a', 'b']);
    expect(next[0]?.messages).toEqual([
      { id: 'c-new', content: 'fresh', createdAt: '2026-01-02' },
    ]);
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
