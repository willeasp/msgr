import { describe, expect, it } from 'vitest';
import { Page } from './page.js';

describe('Page.parse', () => {
  it('defaults missing and null arguments', () => {
    const defaults = {
      ok: true,
      value: {
        limit: Page.DEFAULT_LIMIT,
        offset: 0,
        before: null,
        after: null,
      },
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
      value: { limit: 10, offset: 0, before: 'm1', after: null },
    });
    expect(Page.parse({ after: 'm1' })).toMatchObject({
      ok: true,
      value: { before: null, after: 'm1' },
    });
  });
});
