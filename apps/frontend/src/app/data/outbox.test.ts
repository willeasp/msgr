import { ApolloClient, ApolloLink } from '@apollo/client';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import type { Bits } from '@msgr/media';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCache } from '../../lib/cache';
import { HISTORY_PAGE } from '../../lib/history';
import { GET_CHAT_MESSAGES } from './chats';
import { pictures } from './media';
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
  readonly variables: {
    id: string;
    chatId: string;
    content: string | null;
    picture: { width: number; height: number } | null;
  };
  readonly signal: AbortSignal;
  /** Answers with the message stored, at this time. */
  answer(createdAt?: string): void;
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
        const { id, chatId, content, picture } = options.variables;
        asked.push({
          variables: options.variables,
          signal,
          answer: (createdAt) =>
            resolve({
              data: {
                sendMessage: answered(
                  {
                    ...stored(id, content, createdAt),
                    picture: shown(id, picture),
                  },
                  chatId
                ),
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

const stored = (
  id: string,
  content: string | null,
  createdAt = '2026-10-25T12:00:00.000Z'
): HistoryMessage => ({
  __typename: 'Message',
  id,
  content,
  picture: null,
  movie: null,
  sound: null,
  sender,
  createdAt,
});
/** A picture as the server shows it, at its own address. */
const shown = (id: string, picture: { width: number; height: number } | null) =>
  picture && {
    __typename: 'Picture' as const,
    width: picture.width,
    height: picture.height,
    url: `/media/${id}/picture`,
  };
/** The answer to a send: the message stored, with its chat. */
const answered = (message: HistoryMessage, chatId: string) => ({
  ...message,
  chat: {
    __typename: 'Chat' as const,
    id: chatId,
    kind: 'GROUP' as const,
    title: 'Team',
    counterpart: null,
    participants: [],
  },
});
const history = {
  query: GET_CHAT_MESSAGES,
  variables: { chatId: 'team', limit: HISTORY_PAGE },
};
const at = (minute: number) =>
  new Date(Date.UTC(2026, 9, 25, 12, minute)).toISOString();
const bits: Bits = { width: 8, height: 2, bytes: Uint8Array.of(0xa5, 0x5a) };
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
    // Its turn came only now, with no time left: not even asked.
    expect(asked).toHaveLength(1);
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
    await settleAll();
    expect(asked).toHaveLength(1);
    expect(states()).toEqual([
      ['Heard', 'stored'],
      ['Heard too', 'stored'],
    ]);
  });

  it('lets go of what a history holds, and only that', async () => {
    say('Kept');
    say('Waiting');
    const [kept] = outgoing.now();
    settle(client.cache, 'team', [stored(kept?.message.id ?? '', 'Kept')]);
    expect(states()).toEqual([['Waiting', 'sending']]);
    // Nothing held: the same outbox, so nothing re-renders.
    const now = outgoing.now();
    settle(client.cache, 'team', [stored('elsewhere', 'Elsewhere')]);
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
    client.cache.writeQuery({ ...history, data: { messages: [] } });
    say('Last words');
    await settleAll();

    asked[0]?.answer();
    forgetOutbox();
    await settleAll();
    expect(client.cache.readQuery(history)?.messages).toEqual([]);
    expect(outgoing.now()).toEqual([]);
  });

  it('writes what was stored into its history, and holds it until the history has shown it', async () => {
    client.cache.writeQuery({ ...history, data: { messages: [] } });
    say('Kept');
    await settleAll();
    asked[0]?.answer();
    await settleAll();

    const messages = client.cache.readQuery(history)?.messages ?? [];
    expect(messages.map(({ content }) => content)).toEqual(['Kept']);
    // The window may not have drawn the cache's change yet: until it says
    // it has, the message is still shown from here, so it can't blink out.
    expect(states()).toEqual([['Kept', 'stored']]);
    settle(client.cache, 'team', messages);
    expect(outgoing.now()).toEqual([]);
  });

  it('puts what was stored after its history was fetched into it, in its place, so what comes later goes after it', async () => {
    say('Mine');
    await settleAll();
    // Not opened yet, so nothing to write it into.
    asked[0]?.answer(at(5));
    await settleAll();
    expect(states()).toEqual([['Mine', 'stored']]);

    // The history comes, fetched before it was stored.
    const theirs = (id: string, minute: number) => ({
      ...stored(id, id, at(minute)),
      sender: { ...sender, id: 'them' },
    });
    const fetched = [theirs('Before', 1), theirs('After', 9)];
    client.cache.writeQuery({ ...history, data: { messages: fetched } });
    settle(client.cache, 'team', fetched);
    const messages = client.cache.readQuery(history)?.messages ?? [];
    expect(messages.map(({ content }) => content)).toEqual([
      'Before',
      'Mine',
      'After',
    ]);
    // Let go once the history that holds it is drawn.
    expect(states()).toEqual([['Mine', 'stored']]);
    settle(client.cache, 'team', messages);
    expect(outgoing.now()).toEqual([]);
  });

  it('lets go of one stored before all its history holds, for the page before to bring', async () => {
    say('Long ago');
    await settleAll();
    asked[0]?.answer(at(5));
    await settleAll();

    const later = [
      {
        ...stored('later', 'Later', at(30)),
        sender: { ...sender, id: 'them' },
      },
    ];
    client.cache.writeQuery({ ...history, data: { messages: later } });
    settle(client.cache, 'team', later);
    expect(outgoing.now()).toEqual([]);
    expect(
      client.cache.readQuery(history)?.messages.map(({ content }) => content)
    ).toEqual(['Later']);
  });

  it('keeps a picture as it was made under its real address, the answer’s or the feed’s, so it’s never fetched back', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const sendPicture = (after: Promise<unknown>) =>
      send(client, {
        chatId: 'team',
        content: null,
        made: { kind: 'picture', bits },
        sender,
        after,
      });

    // The feed's copy, before it's even sent.
    sendPicture(new Promise(() => undefined));
    const first = outgoing.now()[0]?.message.id ?? '';
    expect(
      pictures.now({ width: 8, height: 2, url: `local:${first}` })
    ).toEqual({ state: 'here', value: bits });
    received({ ...stored(first, null), picture: shown(first, bits) });
    expect(
      pictures.now({ width: 8, height: 2, url: `/media/${first}/picture` })
    ).toEqual({ state: 'here', value: bits });

    // The answer.
    sendPicture(Promise.resolve());
    const second = outgoing.now()[1]?.message.id ?? '';
    // In line behind the first, which waited for its typing notice.
    await vi.advanceTimersByTimeAsync(2_010);
    // Compressed off the main thread, in its own time.
    await vi.waitFor(() =>
      expect(asked[0]?.variables.picture).toMatchObject({ width: 8, height: 2 })
    );
    asked[0]?.answer();
    await settleAll();
    expect(
      pictures.now({ width: 8, height: 2, url: `/media/${second}/picture` })
    ).toEqual({ state: 'here', value: bits });
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('leaves the cache to recordMessage: the answer isn’t written as the mutation’s own', async () => {
    const real = new ApolloClient({
      cache: createCache(),
      link: new ApolloLink((operation) =>
        of({
          data: {
            sendMessage: answered(
              stored(String(operation.variables['id']), 'Mine'),
              'team'
            ),
          },
        })
      ),
    });
    send(real, {
      chatId: 'team',
      content: 'Mine',
      made: null,
      sender,
      after: Promise.resolve(),
    });
    const id = outgoing.now()[0]?.message.id ?? '';
    await vi.advanceTimersByTimeAsync(10);

    expect(states()).toEqual([['Mine', 'stored']]);
    expect(JSON.stringify(real.cache.extract())).not.toContain(id);
  });
});
