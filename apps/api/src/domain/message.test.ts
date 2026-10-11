import { describe, expect, it } from 'vitest';
import { MessageBody, MessageContent } from './message.js';
import type { Picture } from './picture.js';
import { err, ok } from './result.js';

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

describe('MessageBody.of', () => {
  const text = 'Hello' as MessageContent;
  const picture = {
    width: 1,
    height: 1,
    deflated: new Uint8Array(),
  } as Picture;

  it('takes text, a picture, or both', () => {
    expect(MessageBody.of(text, null)).toEqual(
      ok({ content: text, picture: null })
    );
    expect(MessageBody.of(null, picture)).toEqual(
      ok({ content: null, picture })
    );
    expect(MessageBody.of(text, picture)).toEqual(
      ok({ content: text, picture })
    );
  });

  it('refuses a message with nothing in it', () => {
    expect(MessageBody.of(null, null)).toEqual(
      err({
        type: 'InvalidInput',
        field: 'content',
        reason: 'Write something or attach a picture',
      })
    );
  });
});
