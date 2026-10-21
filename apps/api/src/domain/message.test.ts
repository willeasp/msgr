import { describe, expect, it } from 'vitest';
import { MessageBody, MessageContent } from './message.js';
import type { Movie } from './movie.js';
import type { Picture } from './picture.js';
import type { Sound } from './sound.js';
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
  const sound = { frames: 2, coded: new Uint8Array() } as Sound;
  const none = { picture: null, movie: null, sound: null };

  it('takes text, a picture, a movie or a sound, or text with one of them', () => {
    expect(MessageBody.of(text, null, null, null)).toEqual(
      ok({ content: text, ...none })
    );
    const alone = (attached: object) =>
      ok({ content: null, ...none, ...attached });
    const captioned = (attached: object) =>
      ok({ content: text, ...none, ...attached });
    expect(MessageBody.of(null, picture, null, null)).toEqual(
      alone({ picture })
    );
    expect(MessageBody.of(text, picture, null, null)).toEqual(
      captioned({ picture })
    );
    expect(MessageBody.of(null, null, movie, null)).toEqual(alone({ movie }));
    expect(MessageBody.of(text, null, movie, null)).toEqual(
      captioned({ movie })
    );
    expect(MessageBody.of(null, null, null, sound)).toEqual(alone({ sound }));
    expect(MessageBody.of(text, null, null, sound)).toEqual(
      captioned({ sound })
    );
  });

  it('refuses a message with nothing in it', () => {
    expect(MessageBody.of(null, null, null, null)).toEqual(
      err({
        type: 'InvalidInput',
        field: 'content',
        reason: 'Write something or attach a picture, a movie or a sound',
      })
    );
  });

  it('refuses two things attached', () => {
    const two = (field: string) =>
      err({
        type: 'InvalidInput',
        field,
        reason: 'Attach one picture, movie or sound, not two',
      });
    expect(MessageBody.of(text, picture, movie, null)).toEqual(two('movie'));
    expect(MessageBody.of(text, picture, null, sound)).toEqual(two('sound'));
    expect(MessageBody.of(null, null, movie, sound)).toEqual(two('sound'));
  });
});
