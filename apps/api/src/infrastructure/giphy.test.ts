import { describe, expect, it, vi } from 'vitest';
import { GifOffset, GifSearch, GiphyMedia } from '../domain/gif.js';
import { createGiphy, MAX_FILE_BYTES } from './giphy.js';

const KEY = 'k3yk3yk3y';
const words = (raw: string) => {
  const parsed = GifSearch.parse(raw);
  if (!parsed.ok || !parsed.value) throw new Error(raw);
  return parsed.value;
};
const offset = (raw: string) => {
  const parsed = GifOffset.parse(raw);
  if (!parsed.ok) throw new Error(raw);
  return parsed.value;
};
const media = (raw: string) => {
  const parsed = GiphyMedia.parse(raw);
  if (!parsed) throw new Error(raw);
  return parsed;
};

/** A fetch that answers each request in turn, and remembers what was asked. */
function answering(...responses: (Response | Error)[]) {
  const asked: { url: URL; init: RequestInit | undefined }[] = [];
  const fetch = vi.fn(
    async (input: string | URL | Request, init?: RequestInit) => {
      asked.push({ url: new URL(String(input)), init });
      const next = responses.shift();
      if (!next) throw new Error('asked once too often');
      if (next instanceof Error) throw next;
      return next;
    }
  );
  return { fetch: fetch as unknown as typeof globalThis.fetch, asked };
}

const page = {
  data: [
    {
      id: 'abc',
      title: 'Wave',
      images: {
        original: { width: '480', height: '270' },
        fixed_height: { mp4: 'https://media2.giphy.com/media/abc/200.mp4' },
        fixed_height_small_still: {
          url: 'https://media2.giphy.com/media/abc/100_s.gif',
        },
      },
    },
  ],
  pagination: { total_count: 100, count: 1, offset: 24 },
};

describe('searching GIPHY', () => {
  it('asks for trending GIFs without words, and searches with them, a page at a time', async () => {
    const { fetch, asked } = answering(
      Response.json(page),
      Response.json(page)
    );
    const giphy = createGiphy({ apiKey: KEY, fetch });

    expect(await giphy.search(null, offset('0'))).toEqual({
      ok: true,
      value: {
        gifs: [
          {
            id: 'abc',
            title: 'Wave',
            still: 'https://media2.giphy.com/media/abc/100_s.gif',
            movie: 'https://media2.giphy.com/media/abc/200.mp4',
          },
        ],
        next: 25,
      },
    });
    await giphy.search(words('happy dance'), offset('24'));

    const [trending, search] = asked.map(({ url }) => url);
    expect(trending?.origin + (trending?.pathname ?? '')).toBe(
      'https://api.giphy.com/v1/gifs/trending'
    );
    // Exactly these: no rating, so GIFs of every rating.
    expect(Object.fromEntries(trending?.searchParams ?? [])).toEqual({
      api_key: KEY,
      limit: '24',
      offset: '0',
    });
    expect(search?.pathname).toBe('/v1/gifs/search');
    expect(Object.fromEntries(search?.searchParams ?? [])).toEqual({
      api_key: KEY,
      limit: '24',
      offset: '24',
      q: 'happy dance',
    });
    // No redirect is followed with the key, and none waits forever.
    expect(asked[0]?.init?.redirect).toBe('error');
    expect(asked[0]?.init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('pages what’s trending only as far as GIPHY does, less far than a search', async () => {
    const at = (offset: number) => ({
      ...page,
      pagination: { total_count: 10_000, count: 24, offset },
    });
    const { fetch } = answering(
      Response.json(at(456)),
      Response.json(at(480)),
      Response.json(at(480))
    );
    const giphy = createGiphy({ apiKey: KEY, fetch });

    expect(await giphy.search(null, offset('456'))).toMatchObject({
      value: { next: 480 },
    });
    expect(await giphy.search(null, offset('480'))).toMatchObject({
      value: { next: null },
    });
    expect(await giphy.search(words('cat'), offset('480'))).toMatchObject({
      value: { next: 504 },
    });
  });

  it('says GIPHY is busy when its hourly allowance is spent', async () => {
    const { fetch } = answering(new Response('slow down', { status: 429 }));

    expect(
      await createGiphy({ apiKey: KEY, fetch }).search(null, offset('0'))
    ).toEqual({
      ok: false,
      error: { type: 'Unavailable', service: 'GIPHY', busy: true },
    });
  });

  it('says GIPHY is down for a failure, an error, a timeout or an answer it can’t read', async () => {
    const { fetch } = answering(
      new Response('', { status: 500 }),
      new TypeError('fetch failed'),
      new DOMException('The operation timed out.', 'TimeoutError'),
      new Response('<html>', { headers: { 'content-type': 'text/html' } }),
      Response.json({ data: 'nope' })
    );
    const giphy = createGiphy({ apiKey: KEY, fetch });

    for (let i = 0; i < 5; i++) {
      expect(await giphy.search(null, offset('0'))).toEqual({
        ok: false,
        error: { type: 'Unavailable', service: 'GIPHY', busy: false },
      });
    }
  });

  it('logs a refused key, never the key itself', async () => {
    const logged = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    try {
      const { fetch } = answering(new Response('', { status: 403 }));
      const found = await createGiphy({ apiKey: KEY, fetch }).search(
        null,
        offset('0')
      );

      expect(found.ok).toBe(false);
      expect(logged).toHaveBeenCalledOnce();
      expect(JSON.stringify(logged.mock.calls)).not.toContain(KEY);
    } finally {
      logged.mockRestore();
    }
  });
});

const read = async (body: AsyncIterable<Uint8Array> | undefined) => {
  if (!body) throw new Error('no file');
  const chunks: Uint8Array[] = [];
  for await (const chunk of body) chunks.push(chunk);
  return Buffer.concat(chunks).toString();
};

describe('fetching GIPHY’s files', () => {
  const movie = media('https://media2.giphy.com/media/abc/200.mp4?cid=1&ct=g');

  it('streams a still or a movie as GIPHY sends it, from the address as given', async () => {
    const { fetch, asked } = answering(
      new Response('mp4 bytes', {
        headers: { 'content-type': 'video/mp4', 'content-length': '9' },
      })
    );
    const file = await createGiphy({ apiKey: KEY, fetch }).file(movie);

    expect(file).toMatchObject({ type: 'video/mp4', length: 9 });
    expect(await read(file?.body)).toBe('mp4 bytes');
    expect(String(asked[0]?.url)).toBe(movie);
    // The key is for the API alone.
    expect(String(asked[0]?.url)).not.toContain(KEY);
    expect(asked[0]?.init?.redirect).toBe('manual');
  });

  it('follows a redirect only to GIPHY’s media hosts, and only twice', async () => {
    const redirect = (location: string) =>
      new Response(null, { status: 302, headers: { location } });
    const gif = () =>
      new Response('gif', { headers: { 'content-type': 'image/gif' } });

    const followed = answering(
      redirect('https://media0.giphy.com/media/abc/200.mp4'),
      redirect('/media/abc/again.gif'),
      gif()
    );
    const file = await createGiphy({ apiKey: KEY, fetch: followed.fetch }).file(
      movie
    );
    expect(await read(file?.body)).toBe('gif');
    expect(followed.asked.map(({ url }) => url.href)).toEqual([
      movie,
      'https://media0.giphy.com/media/abc/200.mp4',
      'https://media0.giphy.com/media/abc/again.gif',
    ]);

    for (const location of [
      'https://evil.com/x.gif',
      'http://media.giphy.com/x.gif',
      'http://[',
    ]) {
      const elsewhere = answering(redirect(location));
      expect(
        await createGiphy({ apiKey: KEY, fetch: elsewhere.fetch }).file(movie)
      ).toBeNull();
      expect(elsewhere.asked).toHaveLength(1);
    }

    const loop = answering(
      redirect('https://media.giphy.com/a'),
      redirect('https://media.giphy.com/b'),
      redirect('https://media.giphy.com/c')
    );
    expect(
      await createGiphy({ apiKey: KEY, fetch: loop.fetch }).file(movie)
    ).toBeNull();
  });

  it('is null for a failure, an error, or anything but a still or a movie', async () => {
    const { fetch } = answering(
      new Response('', { status: 404 }),
      new TypeError('fetch failed'),
      new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } }),
      new Response('<html>', { headers: { 'content-type': 'text/html' } }),
      new Response('?'),
      new Response('big', {
        headers: {
          'content-type': 'video/mp4',
          'content-length': String(MAX_FILE_BYTES + 1),
        },
      })
    );
    const giphy = createGiphy({ apiKey: KEY, fetch });

    for (let i = 0; i < 6; i++) expect(await giphy.file(movie)).toBeNull();
  });

  it('stops a file that runs past the most it may be', async () => {
    const chunk = new Uint8Array(MAX_FILE_BYTES / 2 + 1);
    const endless = new ReadableStream<Uint8Array>({
      pull: (controller) => controller.enqueue(chunk),
    });
    const { fetch } = answering(
      new Response(endless, { headers: { 'content-type': 'video/mp4' } })
    );
    const file = await createGiphy({ apiKey: KEY, fetch }).file(movie);

    expect(file?.length).toBeNull();
    await expect(read(file?.body)).rejects.toThrow();
  });

  it('stops a file GIPHY stops sending, however slowly it was read before', async () => {
    let sent = 0;
    const stalling = new ReadableStream<Uint8Array>({
      // Two chunks, then nothing more.
      pull: (controller) =>
        sent++ < 2 ? controller.enqueue(new Uint8Array(10)) : undefined,
    });
    const { fetch } = answering(
      new Response(stalling, { headers: { 'content-type': 'video/mp4' } })
    );
    const file = await createGiphy({ apiKey: KEY, fetch, idleMs: 50 }).file(
      movie
    );
    const reader = file?.body.getReader();

    expect((await reader?.read())?.value).toHaveLength(10);
    // A slow reader isn't a stall: only GIPHY's own silence is.
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect((await reader?.read())?.value).toHaveLength(10);
    await expect(reader?.read()).rejects.toThrow('GIPHY stalled');
  });

  it('gives up on a file GIPHY doesn’t start sending in time', async () => {
    const fetch = vi.fn(
      (_: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) =>
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError'))
          )
        )
    ) as unknown as typeof globalThis.fetch;

    expect(
      await createGiphy({ apiKey: KEY, fetch, timeoutMs: 50 }).file(movie)
    ).toBeNull();
  });

  it('asks for a file as it is, and passes on no length for one GIPHY compressed anyway', async () => {
    const { fetch, asked } = answering(
      new Response('gzipped?', {
        headers: {
          'content-type': 'image/gif',
          'content-encoding': 'gzip',
          'content-length': '3',
        },
      })
    );
    const file = await createGiphy({ apiKey: KEY, fetch }).file(movie);

    expect(new Headers(asked[0]?.init?.headers).get('accept-encoding')).toBe(
      'identity'
    );
    expect(file?.length).toBeNull();
  });
});
