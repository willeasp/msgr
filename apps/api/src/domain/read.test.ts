import { describe, expect, it } from 'vitest';
import { MessageId } from './message.js';
import { firstReadFirst, type Read } from './read.js';
import { UserId } from './user.js';

const read = (reader: string, at: string): Read => ({
  messageId: MessageId('m'),
  readerId: UserId(reader),
  at: new Date(at),
});

describe('firstReadFirst', () => {
  it('puts whoever read first first, and breaks ties by reader', () => {
    const reads = [
      read('linus', '2030-01-01T00:02:00Z'),
      read('grace', '2030-01-01T00:01:00Z'),
      read('ada', '2030-01-01T00:02:00Z'),
    ];

    expect([...reads].sort(firstReadFirst)).toEqual([
      read('grace', '2030-01-01T00:01:00Z'),
      read('ada', '2030-01-01T00:02:00Z'),
      read('linus', '2030-01-01T00:02:00Z'),
    ]);
  });
});
