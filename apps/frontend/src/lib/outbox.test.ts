import { describe, expect, it } from 'vitest';
import { notSent, queued, sendingAgain, stored, waitingIn } from './outbox';

const message = (id: string) => ({ id, content: id });

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
        state: 'failed',
        problem: 'Too long',
      },
    ]);
    expect(sendingAgain(outbox, '1')).toEqual([
      { chatId: 'a', message: message('1'), state: 'sending' },
    ]);
  });

  it('lets go of one once it’s stored, and of nothing else', () => {
    const outbox = queued(queued([], 'a', message('1')), 'a', message('2'));

    expect(stored(outbox, '1')).toEqual([
      { chatId: 'a', message: message('2'), state: 'sending' },
    ]);
    expect(stored(outbox, 'missing')).toBe(outbox);
    expect(notSent(outbox, 'missing', null)).toBe(outbox);
  });
});
