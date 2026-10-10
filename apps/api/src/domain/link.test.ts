import { describe, expect, it } from 'vitest';
import { Url, firstLink } from './link.js';

describe('Url.parse', () => {
  it('accepts absolute http and https URLs', () => {
    expect(Url.parse('https://example.com/a?b#c')).toBe(
      'https://example.com/a?b#c'
    );
    expect(Url.parse('http://x.org')).toBe('http://x.org/');
  });

  it('refuses other schemes, relative links and over-long ones', () => {
    for (const raw of [
      'javascript:alert(1)',
      'ftp://x.org',
      '/relative',
      'example.com',
    ]) {
      expect(Url.parse(raw)).toBeNull();
    }
    expect(Url.parse(`https://x.org/${'a'.repeat(Url.MAX_LENGTH)}`)).toBeNull();
  });

  it('resolves a relative link against a base', () => {
    expect(Url.parse('/img.png', 'https://example.com/page')).toBe(
      'https://example.com/img.png'
    );
  });
});

describe('firstLink', () => {
  it('finds the first link, without the punctuation after it', () => {
    expect(firstLink('see https://a.com/x, and https://b.com')).toBe(
      'https://a.com/x'
    );
    expect(firstLink('https://a.com/x).')).toBe('https://a.com/x');
  });

  it('drops a parenthesis the link did not open, and keeps one it did', () => {
    expect(firstLink('(https://a.com/x)')).toBe('https://a.com/x');
    expect(firstLink('https://en.wikipedia.org/wiki/Foo_(bar)')).toBe(
      'https://en.wikipedia.org/wiki/Foo_(bar)'
    );
  });

  it('finds nothing in text without links', () => {
    expect(firstLink('no links here, just example.com')).toBeNull();
  });
});
