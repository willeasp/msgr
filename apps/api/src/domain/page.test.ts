import { describe, expect, it } from 'vitest';
import { Page } from './page.js';

describe('Page.parse', () => {
  it('defaults missing and null arguments', () => {
    const defaults = {
      ok: true,
      value: { limit: Page.DEFAULT_LIMIT, kind: 'newest', offset: 0 },
    };
    expect(Page.parse({})).toEqual(defaults);
    expect(Page.parse({ limit: null, offset: null })).toEqual(defaults);
  });

  it('accepts the bounds', () => {
    expect(Page.parse({ limit: 1, offset: 0 }).ok).toBe(true);
    expect(Page.parse({ limit: Page.MAX_LIMIT, offset: 10_000 }).ok).toBe(true);
  });

  it.each([
    [{ limit: 0 }, 'limit'],
    [{ limit: Page.MAX_LIMIT + 1 }, 'limit'],
    [{ limit: 2.5 }, 'limit'],
    [{ offset: -1 }, 'offset'],
    [{ offset: 0.5 }, 'offset'],
    [{ before: 'a', after: 'b' }, 'after'],
    [{ before: 'a', offset: 1 }, 'offset'],
    [{ before: '' }, 'before'],
    [{ after: '' }, 'after'],
  ])('rejects %j', (args, field) => {
    expect(Page.parse(args)).toMatchObject({
      ok: false,
      error: { type: 'InvalidInput', field },
    });
  });
});

describe('a page by cursor', () => {
  it('reads back from a message, or forward from one', () => {
    expect(Page.parse({ limit: 10, before: 'm1' })).toEqual({
      ok: true,
      value: { limit: 10, kind: 'before', cursor: 'm1' },
    });
    expect(Page.parse({ after: 'm1', offset: null })).toEqual({
      ok: true,
      value: { limit: Page.DEFAULT_LIMIT, kind: 'after', cursor: 'm1' },
    });
  });
});

describe('Page.key', () => {
  it('tells every page apart, cursors that look alike included', () => {
    const pages = [
      {},
      { limit: 2 },
      { offset: 1 },
      { before: 'm1' },
      { after: 'm1' },
      { before: '1' },
      { before: 'newest' },
    ].map((args) => {
      const page = Page.parse(args);
      if (!page.ok) throw new Error(JSON.stringify(args));
      return Page.key(page.value);
    });
    expect(new Set(pages).size).toBe(pages.length);
    expect(Page.key({ limit: 2, kind: 'newest', offset: 0 })).toBe(
      Page.key({ offset: 0, kind: 'newest', limit: 2 })
    );
  });
});
