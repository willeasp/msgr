import { describe, expect, it } from 'vitest';
import { MessageBody, MessageContent } from './message.js';
import type { Movie } from './movie.js';
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
  const movie = {
    width: 1,
    height: 1,
    frames: 1,
    coded: new Uint8Array(),
  } as Movie;

  it('takes text, a picture or a movie, or text with either', () => {
    expect(MessageBody.of(text, null, null)).toEqual(
      ok({ content: text, picture: null, movie: null })
    );
    expect(MessageBody.of(null, picture, null)).toEqual(
      ok({ content: null, picture, movie: null })
    );
    expect(MessageBody.of(text, picture, null)).toEqual(
      ok({ content: text, picture, movie: null })
    );
    expect(MessageBody.of(null, null, movie)).toEqual(
      ok({ content: null, picture: null, movie })
    );
    expect(MessageBody.of(text, null, movie)).toEqual(
      ok({ content: text, picture: null, movie })
    );
  });

  it('refuses a message with nothing in it', () => {
    expect(MessageBody.of(null, null, null)).toEqual(
      err({
        type: 'InvalidInput',
        field: 'content',
        reason: 'Write something or attach a picture or a movie',
      })
    );
  });

  it('refuses a picture and a movie together', () => {
    expect(MessageBody.of(text, picture, movie)).toEqual(
      err({
        type: 'InvalidInput',
        field: 'movie',
        reason: 'Attach a picture or a movie, not both',
      })
    );
  });
});
