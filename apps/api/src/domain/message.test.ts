import { describe, expect, it } from 'vitest';
import { MessageContent } from './message.js';

describe('MessageContent.parse', () => {
  it('trims surrounding whitespace', () => {
    expect(MessageContent.parse('  hello \n')).toEqual({
      ok: true,
      value: 'hello',
    });
  });

  it('rejects blank messages', () => {
    expect(MessageContent.parse(' \n\t ')).toEqual({
      ok: false,
      error: {
        type: 'InvalidInput',
        field: 'content',
        reason: 'Message must not be blank',
      },
    });
  });

  it('accepts the maximum length and rejects one more', () => {
    const max = 'x'.repeat(MessageContent.MAX_LENGTH);
    expect(MessageContent.parse(max).ok).toBe(true);
    expect(MessageContent.parse(`${max}x`).ok).toBe(false);
  });
});
