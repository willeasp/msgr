import { describe, expect, it } from 'vitest';
import { firstLink, splitLinks } from './links';

describe('splitLinks', () => {
  it('cuts links out of text', () => {
    expect(splitLinks('a https://x.com b')).toEqual([
      { text: 'a ' },
      { link: 'https://x.com' },
      { text: ' b' },
    ]);
  });

  it('leaves text without links as it is', () => {
    expect(splitLinks('just example.com, no scheme')).toEqual([
      { text: 'just example.com, no scheme' },
    ]);
  });

  it('leaves out the punctuation after a link, and a parenthesis it did not open', () => {
    expect(splitLinks('see https://a.com/x).')).toEqual([
      { text: 'see ' },
      { link: 'https://a.com/x' },
      { text: ').' },
    ]);
    expect(splitLinks('https://en.wikipedia.org/wiki/Foo_(bar)')).toEqual([
      { link: 'https://en.wikipedia.org/wiki/Foo_(bar)' },
    ]);
  });

  it('ignores a scheme with nothing after it', () => {
    expect(splitLinks('type https:// then')).toEqual([
      { text: 'type https:// then' },
    ]);
  });
});

describe('firstLink', () => {
  it('finds the first link, or none', () => {
    expect(firstLink('one https://a.com, two http://b.org')).toBe(
      'https://a.com'
    );
    expect(firstLink('none here')).toBeNull();
  });
});
