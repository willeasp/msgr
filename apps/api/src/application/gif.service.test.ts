import { describe, expect, it, vi } from 'vitest';
import { GiphyMedia, type Gif } from '../domain/gif.js';
import { createTestApp, expectOk, fakeGiphy } from '../testing/harness.js';

const at = (path: string) =>
  GiphyMedia.parse(`https://media.giphy.com/${path}`) as GiphyMedia;
const gif = (id: string, title: string): Gif => ({
  id,
  title,
  still: at(`media/${id}/100_s.gif`),
  movie: at(`media/${id}/200.mp4`),
});

async function setUp(gifs: readonly Gif[] = []) {
  const giphy = fakeGiphy(gifs);
  const app = createTestApp({ giphy });
  const ada = await app.fixtures.user({ name: 'Ada' });
  return { ...app, giphy, ada, gifs: app.services().gifs };
}

describe('GIFs', () => {
  it('are on while the server has GIPHY, and off without', async () => {
    expect((await setUp()).gifs.on()).toBe(true);

    const off = createTestApp({ giphy: null });
    const ada = await off.fixtures.user({ name: 'Ada' });
    const gifs = off.services().gifs;
    expect(gifs.on()).toBe(false);
    expect(await gifs.search(ada, 'cat', null)).toEqual({
      ok: true,
      value: null,
    });
    expect(
      await gifs.file(ada, 'https://media.giphy.com/media/a/200.mp4')
    ).toBeNull();
  });

  it('are what’s trending without words, and found by them with, a page at a time', async () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      gif(`g${i}`, i % 2 ? 'Cat' : 'Dog')
    );
    const { gifs, ada } = await setUp(many);

    const trending = expectOk(await gifs.search(ada, null, null));
    expect(trending?.gifs).toHaveLength(24);
    expect(trending?.next).toBe(24);
    const rest = expectOk(await gifs.search(ada, '', String(trending?.next)));
    expect(rest?.gifs.map(({ id }) => id)).toEqual([
      'g24',
      'g25',
      'g26',
      'g27',
      'g28',
      'g29',
    ]);
    expect(rest?.next).toBeNull();

    const cats = expectOk(await gifs.search(ada, '  cat ', null));
    expect(cats?.gifs).toHaveLength(15);
  });

  it('asks GIPHY for the words as parsed, and refuses what can’t be a search or a page', async () => {
    const { gifs, ada, giphy } = await setUp();
    const search = vi.spyOn(giphy, 'search');

    await gifs.search(ada, '  happy   dance ', '48');
    expect(search).toHaveBeenCalledWith('happy dance', 48);

    expect(await gifs.search(ada, 'x'.repeat(51), null)).toMatchObject({
      ok: false,
      error: { type: 'InvalidInput', field: 'search' },
    });
    expect(await gifs.search(ada, 'cat', '-1')).toMatchObject({
      ok: false,
      error: { type: 'InvalidInput', field: 'after' },
    });
    expect(search).toHaveBeenCalledOnce();
  });

  it('pass on GIPHY being busy or down', async () => {
    const { gifs, ada, giphy } = await setUp();
    vi.spyOn(giphy, 'search').mockResolvedValue({
      ok: false,
      error: { type: 'Unavailable', service: 'GIPHY', busy: true },
    });

    expect(await gifs.search(ada, null, null)).toEqual({
      ok: false,
      error: { type: 'Unavailable', service: 'GIPHY', busy: true },
    });
  });

  it('fetch only from GIPHY’s own addresses', async () => {
    const { gifs, ada, giphy } = await setUp([gif('a', 'A')]);
    const file = vi.spyOn(giphy, 'file');

    expect(
      await gifs.file(ada, 'https://media.giphy.com/media/a/200.mp4')
    ).toMatchObject({ type: 'video/mp4' });
    for (const elsewhere of [
      'https://evil.com/media/a/200.mp4',
      'http://media.giphy.com/media/a/200.mp4',
      'nonsense',
    ]) {
      expect(await gifs.file(ada, elsewhere)).toBeNull();
    }
    expect(file).toHaveBeenCalledOnce();
  });
});
