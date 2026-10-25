import { randomFillSync } from 'node:crypto';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { describe, expect, it } from 'vitest';
import {
  chosenId,
  notSent,
  queued,
  sendAllowance,
  sendingAgain,
  settled,
  stored,
  tooLong,
  waitingIn,
  whyNotSent,
  withStored,
  type Outbox,
} from './outbox';

const message = (id: string, content = id) => ({ id, content });
const states = (outbox: Outbox<{ id: string }>) =>
  outbox.map(({ message, state }) => [message.id, state]);

describe('the outbox', () => {
  it('holds what was sent, each on its way, in the order sent', () => {
    const outbox = queued(queued([], 'a', message('1')), 'a', message('2'));

    expect(waitingIn(outbox, 'a', [])).toEqual([
      { chatId: 'a', message: message('1'), state: 'sending' },
      { chatId: 'a', message: message('2'), state: 'sending' },
    ]);
  });

  it('shows in a chat only its own, and only those its history doesn’t hold yet', () => {
    const outbox = queued(
      queued(queued([], 'a', message('1')), 'b', message('2')),
      'a',
      message('3')
    );

    expect(waitingIn(outbox, 'a', [message('1')])).toEqual([
      { chatId: 'a', message: message('3'), state: 'sending' },
    ]);
    expect(waitingIn(outbox, 'b', [])).toEqual([
      { chatId: 'b', message: message('2'), state: 'sending' },
    ]);
  });

  it('says one wasn’t sent, and why if the server said, until it’s tried again', () => {
    const outbox = notSent(queued([], 'a', message('1')), '1', 'Too long');

    expect(outbox).toEqual([
      {
        chatId: 'a',
        message: message('1'),
        state: 'notSent',
        problem: 'Too long',
      },
    ]);
    expect(sendingAgain(outbox, '1')).toEqual([
      { chatId: 'a', message: message('1'), state: 'sending' },
    ]);
  });

  it('holds one stored as the server stored it, whichever word came first, until its history does', () => {
    const outbox = queued(queued([], 'a', message('1')), 'a', message('2'));
    const answered = stored(outbox, '1', message('1', 'as stored'));

    expect(answered).toEqual([
      { chatId: 'a', message: message('1', 'as stored'), state: 'stored' },
      { chatId: 'a', message: message('2'), state: 'sending' },
    ]);
    // The feed's copy, or the answer, coming second changes nothing.
    expect(stored(answered, '1', message('1', 'again'))).toBe(answered);
    // Its answer lost, a message not sent may be stored all the same.
    expect(
      states(stored(notSent(outbox, '2', null), '2', message('2')))
    ).toEqual([
      ['1', 'sending'],
      ['2', 'stored'],
    ]);
  });

  it('never takes one back a step: a stored one doesn’t fail, and only one not sent is sent again', () => {
    const outbox = stored(queued([], 'a', message('1')), '1', message('1'));

    // The answer failing after the feed brought it.
    expect(notSent(outbox, '1', 'Late')).toBe(outbox);
    expect(sendingAgain(outbox, '1')).toBe(outbox);
    // Try Again pressed twice, or on one still on its way.
    const sending = queued([], 'a', message('2'));
    expect(sendingAgain(sending, '2')).toBe(sending);
    const again = sendingAgain(notSent(sending, '2', null), '2');
    expect(notSent(again, '2', 'x')).toEqual([
      { chatId: 'a', message: message('2'), state: 'notSent', problem: 'x' },
    ]);
  });

  it('lets go of what a history holds, whatever its state, and of nothing else', () => {
    const outbox = notSent(
      stored(
        queued(queued(queued([], 'a', message('1')), 'a', message('2')), 'b', {
          id: '3',
          content: '3',
        }),
        '1',
        message('1')
      ),
      '2',
      null
    );

    // A catch-up's page may hold one whose answer was lost.
    expect(states(settled(outbox, [message('1'), message('2')]))).toEqual([
      ['3', 'sending'],
    ]);
    expect(settled(outbox, [message('elsewhere')])).toBe(outbox);
    expect(settled([], [message('1')])).toEqual([]);
  });

  it('sends one not sent again last, as it’s stored after what was sent meanwhile', () => {
    const outbox = queued(
      notSent(queued([], 'a', message('1')), '1', null),
      'a',
      message('2')
    );

    expect(states(sendingAgain(outbox, '1'))).toEqual([
      ['2', 'sending'],
      ['1', 'sending'],
    ]);
  });

  it('changes nothing for a message it doesn’t hold', () => {
    const outbox = queued([], 'a', message('1'));

    expect(notSent(outbox, 'missing', null)).toBe(outbox);
    expect(sendingAgain(outbox, 'missing')).toBe(outbox);
    expect(stored(outbox, 'missing', message('missing'))).toBe(outbox);
  });
});

describe('whyNotSent', () => {
  it('gives the server’s reason when it refused what was sent', () => {
    const refused = new CombinedGraphQLErrors({
      errors: [
        {
          message: 'Message must be at most 4000 characters',
          extensions: { code: 'BAD_USER_INPUT' },
        },
      ],
    });

    expect(whyNotSent(refused)).toBe('Message must be at most 4000 characters');
  });

  it('gives none when the server failed, wasn’t reached, or took too long', () => {
    const failed = new CombinedGraphQLErrors({
      errors: [{ message: 'Something went wrong' }],
    });

    expect(whyNotSent(failed)).toBeNull();
    expect(whyNotSent(new TypeError('Failed to fetch'))).toBeNull();
    expect(
      whyNotSent(new DOMException('The operation timed out.', 'TimeoutError'))
    ).toBeNull();
  });
});

describe('tooLong', () => {
  it('lets through what the server stores, and says how far over the rest is', () => {
    expect(tooLong('a'.repeat(4000))).toBeNull();
    expect(tooLong('a'.repeat(4001))).toBe(
      'A message can be at most 4,000 characters. This one is 4,001.'
    );
    // Counted as the server counts: an emoji is two.
    expect(tooLong('😀'.repeat(2000))).toBeNull();
    expect(tooLong(`${'😀'.repeat(2000)}a`)).not.toBeNull();
  });
});

describe('sendAllowance', () => {
  it('gives a minute, and longer for what takes longer to upload', () => {
    expect(sendAllowance(0)).toBe(60_000);
    // A megabyte of movie, at 16 kB a second.
    expect(sendAllowance(1_000_000)).toBe(60_000 + 62_500);
  });
});

describe('chosenId', () => {
  const UUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  it('makes a version 4 UUID, the only id the server takes from a sender, of any bytes', () => {
    expect(chosenId((bytes) => bytes.fill(0))).toBe(
      '00000000-0000-4000-8000-000000000000'
    );
    expect(chosenId((bytes) => bytes.fill(0xff))).toBe(
      'ffffffff-ffff-4fff-bfff-ffffffffffff'
    );
    for (let i = 0; i < 100; i++) {
      expect(chosenId((bytes) => randomFillSync(bytes))).toMatch(UUID);
    }
  });

  it('writes the bytes it was given, in order', () => {
    expect(
      chosenId((bytes) => bytes.forEach((_, i) => (bytes[i] = i * 17)))
    ).toBe('00112233-4455-4677-8899-aabbccddeeff');
  });
});

describe('withStored', () => {
  const at = (id: string, minute: number) => ({
    id,
    createdAt: new Date(Date.UTC(2026, 9, 25, 12, minute)).toISOString(),
  });

  it('puts a message stored after the history was fetched in its place, by time and then id', () => {
    const history = [at('a', 1), at('c', 3), at('e', 5)];

    expect(withStored(history, [at('d', 4)]).map(({ id }) => id)).toEqual([
      'a',
      'c',
      'd',
      'e',
    ]);
    expect(
      withStored(history, [at('f', 6), at('b', 2)]).map(({ id }) => id)
    ).toEqual(['a', 'b', 'c', 'e', 'f']);
    // The same moment: by id, as the server orders them.
    expect(
      withStored([at('a', 1), at('c', 1)], [at('b', 1)]).map(({ id }) => id)
    ).toEqual(['a', 'b', 'c']);
    expect(withStored([], [at('a', 1)])).toEqual([at('a', 1)]);
  });

  it('leaves out what it holds, and what’s older than all it holds, which the page before brings', () => {
    const history = [at('c', 3), at('e', 5)];

    expect(withStored(history, [at('c', 3)])).toBe(history);
    expect(withStored(history, [at('a', 1)])).toBe(history);
    expect(withStored(history, [])).toBe(history);
  });
});
