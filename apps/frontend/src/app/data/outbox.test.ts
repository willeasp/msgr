import type { ApolloClient } from '@apollo/client';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCache } from '../../lib/cache';
import { HISTORY_PAGE } from '../../lib/history';
import { GET_CHAT_MESSAGES } from './chats';
import {
  forgetOutbox,
  outgoing,
  received,
  send,
  settle,
  tryAgain,
  type HistoryMessage,
} from './outbox';

/** A send the fake server holds until the test answers it. */
interface Asked {
  readonly variables: { id: string; chatId: string; content: string | null };
  readonly signal: AbortSignal;
  answer(): void;
  refuse(message: string, code?: string): void;
}

const sender = {
  __typename: 'User' as const,
  id: 'me',
  name: 'Me',
  avatar: null,
};
let asked: Asked[] = [];
let client: ApolloClient;

beforeEach(() => {
  vi.useFakeTimers();
  forgetOutbox();
  asked = [];
  const mutate = vi.fn(
    (options: {
      variables: Asked['variables'];
      context: { fetchOptions: { signal: AbortSignal } };
    }) =>
      new Promise((resolve, reject) => {
        const { signal } = options.context.fetchOptions;
        signal.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError'))
        );
        const { id, chatId, content } = options.variables;
        asked.push({
          variables: options.variables,
          signal,
          answer: () =>
            resolve({
              data: {
                sendMessage: {
                  ...stored(id, content),
                  chat: {
                    __typename: 'Chat',
                    id: chatId,
                    kind: 'GROUP',
                    title: 'Team',
                    counterpart: null,
                    participants: [],
                  },
                },
              },
            }),
          refuse: (message, code) =>
            reject(
              new CombinedGraphQLErrors({
                errors: [{ message, extensions: code ? { code } : {} }],
              })
            ),
        });
      })
  );
  client = { mutate, cache: createCache() } as unknown as ApolloClient;
});
afterEach(() => {
  vi.useRealTimers();
});

const stored = (id: string, content: string | null): HistoryMessage => ({
  __typename: 'Message',
  id,
  content,
  picture: null,
  movie: null,
  sound: null,
  sender,
  createdAt: '2026-10-25T12:00:00.000Z',
});
const say = (content: string, after: Promise<unknown> = Promise.resolve()) =>
  send(client, { chatId: 'team', content, made: null, sender, after });
const states = () =>
  outgoing.now().map(({ message, state }) => [message.content, state]);
/** Lets every promise that can settle, settle. */
const settleAll = () => vi.advanceTimersByTimeAsync(0);

describe('the outbox', () => {
  it('shows a message at once, under a version 4 UUID it’s sent under', async () => {
    say('Hello');
    expect(states()).toEqual([['Hello', 'sending']]);
    await settleAll();

    const [first] = asked;
    expect(first?.variables).toMatchObject({
      chatId: 'team',
      content: 'Hello',
    });
    expect(first?.variables.id).toBe(outgoing.now()[0]?.message.id);
    expect(first?.variables.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });

  it('sends a chat’s messages one after another, so they’re stored as they were sent', async () => {
    say('First');
    say('Second');
    await settleAll();
    expect(asked.map(({ variables }) => variables.content)).toEqual(['First']);

    asked[0]?.answer();
    await settleAll();
    expect(asked.map(({ variables }) => variables.content)).toEqual([
      'First',
      'Second',
    ]);
    expect(states()).toEqual([
      ['First', 'stored'],
      ['Second', 'sending'],
    ]);
  });

  it('waits for the last typing notice, but never long: one that hangs doesn’t hold the message', async () => {
    say('After typing', new Promise(() => undefined));
    await vi.advanceTimersByTimeAsync(1_999);
    expect(asked).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(asked).toHaveLength(1);
  });

  it('gives up on one a minute after it was sent, however long it waited its turn', async () => {
    say('Stuck');
    say('Behind it');
    // A minute, and a millisecond for its few bytes.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(states()).toEqual([
      ['Stuck', 'sending'],
      ['Behind it', 'sending'],
    ]);
    await vi.advanceTimersByTimeAsync(1);
    // Its turn came only now, with no time left.
    expect(states()).toEqual([
      ['Stuck', 'notSent'],
      ['Behind it', 'notSent'],
    ]);
  });

  it('says why when the server refused it, and Try Again sends the same message again', async () => {
    say('Too much');
    await settleAll();
    asked[0]?.refuse(
      'Message must be at most 4000 characters',
      'BAD_USER_INPUT'
    );
    await settleAll();
    expect(outgoing.now()[0]).toMatchObject({
      state: 'notSent',
      problem: 'Message must be at most 4000 characters',
    });

    const id = outgoing.now()[0]?.message.id ?? '';
    await vi.advanceTimersByTimeAsync(30_000);
    tryAgain(client, id);
    tryAgain(client, id);
    expect(states()).toEqual([['Too much', 'sending']]);
    await settleAll();
    // Once, under the same id.
    expect(asked.map(({ variables }) => variables.id)).toEqual([id, id]);
    // A fresh minute from Try Again.
    await vi.advanceTimersByTimeAsync(59_000);
    expect(states()).toEqual([['Too much', 'sending']]);
    await vi.advanceTimersByTimeAsync(1_001);
    expect(states()).toEqual([['Too much', 'notSent']]);
  });

  it('takes the feed’s copy as stored, and then neither sends it nor lets a late failure take it back', async () => {
    say('Heard', new Promise(() => undefined));
    const id = outgoing.now()[0]?.message.id ?? '';
    received(stored(id, 'Heard'));
    expect(states()).toEqual([['Heard', 'stored']]);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(asked).toHaveLength(0);

    say('Heard too');
    await settleAll();
    const second = outgoing.now()[1]?.message.id ?? '';
    received(stored(second, 'Heard too'));
    asked[0]?.refuse('Too late');
    await settleAll();
    expect(states()).toEqual([
      ['Heard', 'stored'],
      ['Heard too', 'stored'],
    ]);
    // And Try Again has nothing to send.
    tryAgain(client, second);
    expect(asked).toHaveLength(1);
  });

  it('lets go of what a history holds, and only that', async () => {
    say('Kept');
    say('Waiting');
    const [kept] = outgoing.now();
    settle([{ id: kept?.message.id ?? '' }]);
    expect(states()).toEqual([['Waiting', 'sending']]);
    // Nothing held: the same outbox, so nothing re-renders.
    const now = outgoing.now();
    settle([{ id: 'elsewhere' }]);
    expect(outgoing.now()).toBe(now);
  });

  it('forgets everything when the session ends: what’s on its way is let go, and what waits never goes', async () => {
    const changes = vi.fn();
    const stop = outgoing.subscribe(changes);
    say('Going');
    say('Waiting');
    await settleAll();
    const [going] = asked;

    forgetOutbox();
    expect(going?.signal.aborted).toBe(true);
    expect(outgoing.now()).toEqual([]);
    going?.answer();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(asked).toHaveLength(1);
    expect(outgoing.now()).toEqual([]);
    expect(changes).toHaveBeenCalledTimes(3);
    stop();
  });

  it('writes nothing of an answer that lands as the session ends', async () => {
    const history = {
      query: GET_CHAT_MESSAGES,
      variables: { chatId: 'team', limit: HISTORY_PAGE },
    };
    client.cache.writeQuery({ ...history, data: { messages: [] } });
    say('Last words');
    await settleAll();

    asked[0]?.answer();
    forgetOutbox();
    await settleAll();
    expect(client.cache.readQuery(history)?.messages).toEqual([]);
    expect(outgoing.now()).toEqual([]);
  });

  it('writes the stored message into its history, which then lets it go', async () => {
    const history = {
      query: GET_CHAT_MESSAGES,
      variables: { chatId: 'team', limit: HISTORY_PAGE },
    };
    client.cache.writeQuery({ ...history, data: { messages: [] } });
    say('Kept');
    await settleAll();
    asked[0]?.answer();
    await settleAll();

    const messages = client.cache.readQuery(history)?.messages ?? [];
    expect(messages.map(({ content }) => content)).toEqual(['Kept']);
    expect(states()).toEqual([['Kept', 'stored']]);
    settle(messages);
    expect(outgoing.now()).toEqual([]);
  });
});
