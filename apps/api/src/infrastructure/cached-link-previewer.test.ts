import { describe, expect, it, vi } from 'vitest';
import type { LinkPreviewer } from '../application/ports.js';
import type { LinkPreview } from '../domain/link-preview.js';
import type { Url } from '../domain/link.js';
import { cachedLinkPreviewer } from './cached-link-previewer.js';

const HOUR = 60 * 60 * 1000;
const url = (n: number) => `https://example.com/${n}` as Url;
const card = (link: Url): LinkPreview => ({
  url: link,
  site: 'Example',
  title: link,
  description: null,
  thumbnail: null,
});

function world(answer: (link: Url) => LinkPreview | null = card) {
  let now = 0;
  const inner: LinkPreviewer = { preview: vi.fn(async (link) => answer(link)) };
  const later = (ms: number) => {
    now += ms;
  };
  return { inner, later, clock: () => new Date(now) };
}

describe('the link preview cache', () => {
  it('keeps a preview for a day', async () => {
    const { inner, later, clock } = world();
    const cached = cachedLinkPreviewer(inner, clock);

    expect(await cached.preview(url(1))).toEqual(card(url(1)));
    later(23 * HOUR);
    await cached.preview(url(1));
    expect(inner.preview).toHaveBeenCalledTimes(1);
    later(2 * HOUR);
    await cached.preview(url(1));
    expect(inner.preview).toHaveBeenCalledTimes(2);
  });

  it('tries a failed link again after an hour', async () => {
    const { inner, later, clock } = world(() => null);
    const cached = cachedLinkPreviewer(inner, clock);

    expect(await cached.preview(url(1))).toBeNull();
    later(HOUR / 2);
    await cached.preview(url(1));
    expect(inner.preview).toHaveBeenCalledTimes(1);
    later(HOUR);
    await cached.preview(url(1));
    expect(inner.preview).toHaveBeenCalledTimes(2);
  });

  it('forgets the oldest link when full', async () => {
    const { inner, clock } = world();
    const cached = cachedLinkPreviewer(inner, clock, { maxEntries: 2 });

    for (const n of [1, 2, 3]) await cached.preview(url(n));
    await cached.preview(url(3));
    await cached.preview(url(2));
    expect(inner.preview).toHaveBeenCalledTimes(3);
    await cached.preview(url(1));
    expect(inner.preview).toHaveBeenCalledTimes(4);
  });

  it('shares one fetch between requests for the same link at once', async () => {
    const { inner, clock } = world();
    const cached = cachedLinkPreviewer(inner, clock);

    const [a, b] = await Promise.all([
      cached.preview(url(1)),
      cached.preview(url(1)),
    ]);

    expect(a).toEqual(b);
    expect(inner.preview).toHaveBeenCalledTimes(1);
  });
});
