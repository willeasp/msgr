import { describe, expect, it } from 'vitest';
import {
  GifOffset,
  GifSearch,
  GiphyMedia,
  readGiphyPage,
  type GifPage,
} from './gif.js';

describe('GifSearch.parse', () => {
  it('trims the words and runs their spaces together', () => {
    expect(GifSearch.parse('  happy   dance \n')).toEqual({
      ok: true,
      value: 'happy dance',
    });
  });

  it('takes no words at all for trending', () => {
    expect(GifSearch.parse('')).toEqual({ ok: true, value: null });
    expect(GifSearch.parse('   ')).toEqual({ ok: true, value: null });
  });

  it('refuses more than GIPHY searches for', () => {
    expect(GifSearch.parse('a'.repeat(50)).ok).toBe(true);
    expect(GifSearch.parse('a'.repeat(51))).toEqual({
      ok: false,
      error: {
        type: 'InvalidInput',
        field: 'search',
        reason: 'Search for at most 50 characters',
      },
    });
  });
});

describe('GifOffset.parse', () => {
  it('takes the cursors GIPHY pages by', () => {
    expect(GifOffset.parse('0')).toEqual({ ok: true, value: 0 });
    expect(GifOffset.parse('4999')).toEqual({ ok: true, value: 4999 });
  });

  it('refuses anything else', () => {
    for (const raw of ['', '-1', '5000', '1.5', '1e3', ' 1', '00000', 'x']) {
      expect(GifOffset.parse(raw).ok).toBe(false);
    }
  });
});

describe('GiphyMedia.parse', () => {
  it('takes GIPHY’s media addresses as they are', () => {
    const url =
      'https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjEx/abc123/200.mp4?cid=790b7611&rid=200.mp4&ct=g';
    expect(GiphyMedia.parse(url)).toBe(url);
    for (const host of ['media.giphy.com', 'media0.giphy.com', 'i.giphy.com']) {
      expect(GiphyMedia.parse(`https://${host}/media/abc/200.mp4`)).not.toBe(
        null
      );
    }
  });

  it('refuses any other host, scheme, port or login', () => {
    for (const raw of [
      'http://media.giphy.com/media/abc/200.mp4',
      'https://giphy.com/media/abc/200.mp4',
      'https://api.giphy.com/v1/gifs/trending',
      'https://media.giphy.com.example.com/x.gif',
      'https://media10.giphy.com/x.gif',
      'https://evil.com/media.giphy.com/x.gif',
      'https://media.giphy.com:8443/x.gif',
      'https://user:pass@media.giphy.com/x.gif',
      'https://user@media.giphy.com/x.gif',
      'file:///etc/passwd',
      '/giphy/media?url=x',
      'not a url',
      `https://media.giphy.com/${'a'.repeat(GiphyMedia.MAX_LENGTH)}`,
    ]) {
      expect(GiphyMedia.parse(raw)).toBeNull();
    }
  });
});

/** As GIPHY writes a result: sizes as strings, every rendition its own. */
function result(
  id: string,
  { width = '480', height = '270', title = `${id} GIF` } = {}
) {
  const at = (rendition: string, ext: string) =>
    `https://media1.giphy.com/media/v1.x/${id}/${rendition}.${ext}?cid=c&rid=${rendition}.${ext}&ct=g`;
  return {
    type: 'gif',
    id,
    title,
    images: {
      original: { width, height, url: at('giphy', 'gif') },
      fixed_height: { width: '356', height: '200', mp4: at('200', 'mp4') },
      fixed_height_small_still: { url: at('100_s', 'gif') },
      fixed_width: { width: '200', height: '356', mp4: at('200w', 'mp4') },
      fixed_width_small_still: { url: at('100w_s', 'gif') },
    },
  };
}

const page = (data: unknown[], offset = 0, total = 1000) => ({
  data,
  pagination: { total_count: total, count: data.length, offset },
  meta: { status: 200, msg: 'OK' },
});

describe('readGiphyPage', () => {
  it('keeps each GIF’s title, and its still and movie by its short side', () => {
    const read = readGiphyPage(
      page([
        result('wide'),
        result('tall', { width: '270', height: '480', title: '  Tall  ' }),
      ])
    );

    expect(read?.gifs).toEqual([
      {
        id: 'wide',
        title: 'wide GIF',
        still:
          'https://media1.giphy.com/media/v1.x/wide/100_s.gif?cid=c&rid=100_s.gif&ct=g',
        movie:
          'https://media1.giphy.com/media/v1.x/wide/200.mp4?cid=c&rid=200.mp4&ct=g',
      },
      {
        id: 'tall',
        title: 'Tall',
        still:
          'https://media1.giphy.com/media/v1.x/tall/100w_s.gif?cid=c&rid=100w_s.gif&ct=g',
        movie:
          'https://media1.giphy.com/media/v1.x/tall/200w.mp4?cid=c&rid=200w.mp4&ct=g',
      },
    ]);
  });

  it('leaves out a GIF without a still or a movie on GIPHY’s hosts, or with an odd id', () => {
    const noMovie = result('a');
    delete (noMovie.images as Partial<typeof noMovie.images>).fixed_height;
    const elsewhere = result('b');
    elsewhere.images.fixed_height_small_still.url = 'https://evil.com/x.gif';
    const odd = result('c');
    odd.id = '../x';

    expect(
      readGiphyPage(
        page([noMovie, elsewhere, odd, null, 'x', result('d')])
      )?.gifs.map(({ id }) => id)
    ).toEqual(['d']);
  });

  it('keeps titles short, and takes none for none', () => {
    const long = result('a', { title: 'x'.repeat(500) });
    const none: Record<string, unknown> = result('b');
    delete none['title'];

    const [first, second] = readGiphyPage(page([long, none]))?.gifs ?? [];
    expect(first?.title).toHaveLength(200);
    expect(second?.title).toBe('');
  });

  it('pages on from what GIPHY gave, though some were left out, up to its last', () => {
    const next = (read: GifPage | null) => read?.next;
    expect(next(readGiphyPage(page([result('a'), {}], 48)))).toBe(50);
    // The last page, by count or by GIPHY's furthest.
    expect(next(readGiphyPage(page([result('a')], 999, 1000)))).toBeNull();
    expect(next(readGiphyPage(page([result('a')], 4999, 10_000)))).toBeNull();
    expect(next(readGiphyPage(page([], 0, 0)))).toBeNull();
  });

  it('is null for anything that isn’t a page', () => {
    for (const json of [
      null,
      [],
      'x',
      { data: [] },
      { data: {}, pagination: {} },
    ]) {
      expect(readGiphyPage(json)).toBeNull();
    }
  });
});
