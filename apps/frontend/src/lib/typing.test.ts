import { describe, expect, it } from 'vitest';
import {
  nextExpiry,
  shouldSayTyping,
  stillTyping,
  TYPING_REPEATS_MS,
  TYPING_SHOWS_MS,
  typingIn,
  typingLine,
  withoutTypist,
  withTypist,
} from './typing';

const ana = { id: 'ana', name: 'Ana' };
const bo = { id: 'bo', name: 'Bo' };

describe('typists', () => {
  it('shows someone for a while after they last said they were typing', () => {
    const once = withTypist([], { chatId: 'c', user: ana }, 1000);
    const again = withTypist(once, { chatId: 'c', user: ana }, 4000);

    expect(
      typingIn(stillTyping(once, 1000 + TYPING_SHOWS_MS - 1), 'c')
    ).toEqual(['Ana']);
    expect(typingIn(stillTyping(once, 1000 + TYPING_SHOWS_MS), 'c')).toEqual(
      []
    );
    expect(typingIn(stillTyping(again, 1000 + TYPING_SHOWS_MS), 'c')).toEqual([
      'Ana',
    ]);
    expect(nextExpiry(again)).toBe(4000 + TYPING_SHOWS_MS);
    expect(nextExpiry([])).toBeNull();
  });

  it('keeps each chat apart, and everyone in the order they started', () => {
    let typists = withTypist([], { chatId: 'c', user: ana }, 0);
    typists = withTypist(typists, { chatId: 'c', user: bo }, 10);
    typists = withTypist(typists, { chatId: 'd', user: bo }, 20);
    typists = withTypist(typists, { chatId: 'c', user: ana }, 30);

    expect(typingIn(typists, 'c')).toEqual(['Ana', 'Bo']);
    expect(typingIn(typists, 'd')).toEqual(['Bo']);
  });

  it('stops showing someone once their message arrives', () => {
    let typists = withTypist([], { chatId: 'c', user: ana }, 0);
    typists = withTypist(typists, { chatId: 'd', user: ana }, 0);

    expect(typingIn(withoutTypist(typists, 'c', 'ana'), 'c')).toEqual([]);
    expect(typingIn(withoutTypist(typists, 'c', 'ana'), 'd')).toEqual(['Ana']);
  });

  it('drops whoever has gone quiet when someone else starts', () => {
    const typists = withTypist(
      withTypist([], { chatId: 'c', user: ana }, 0),
      { chatId: 'c', user: bo },
      TYPING_SHOWS_MS
    );

    expect(typists.map(({ id }) => id)).toEqual(['bo']);
  });
});

describe('typingLine', () => {
  it('names one or two, and counts the rest', () => {
    expect(typingLine([])).toBeNull();
    expect(typingLine(['Ana'])).toBe('Ana is typing…');
    expect(typingLine(['Ana', 'Bo'])).toBe('Ana and Bo are typing…');
    expect(typingLine(['Ana', 'Bo', 'Cy'])).toBe(
      'Ana and 2 others are typing…'
    );
  });
});

describe('shouldSayTyping', () => {
  it('says so at once, then again only every so often', () => {
    expect(shouldSayTyping('h', null, 0)).toBe(true);
    expect(shouldSayTyping('he', 0, TYPING_REPEATS_MS - 1)).toBe(false);
    expect(shouldSayTyping('hel', 0, TYPING_REPEATS_MS)).toBe(true);
  });

  it('keeps quiet about blanks and commands', () => {
    expect(shouldSayTyping('  \n', null, 0)).toBe(false);
    expect(shouldSayTyping('/join #general', null, 0)).toBe(false);
  });
});
