import { afterEach, describe, expect, it, vi } from 'vitest';
import { encodeMovie, fromBase64, type Bits } from '@msgr/media';
import { toWire } from '../../lib/picture-wire';
import { forgetMedia, movies, pictures } from './media';

let n = 0; // media.ts lives as long as the page: an address per test
const picture = () => ({ width: 8, height: 2, url: `/media/t${++n}/picture` });
const bits: Bits = { width: 8, height: 2, bytes: Uint8Array.of(0xa5, 0x5a) };
const bytes = async () =>
  fromBase64((await toWire(bits)).bits) as Uint8Array<ArrayBuffer>;
const answer = (
  body: BodyInit | null,
  status = 200,
  type = 'application/octet-stream'
) => new Response(body, { status, headers: { 'Content-Type': type } });
afterEach(() => vi.unstubAllGlobals());

describe('media by address', () => {
  it('fetches an address once, however many ask', async () => {
    const fetch = vi.fn(async () => answer(await bytes()));
    vi.stubGlobal('fetch', fetch);
    const p = picture();
    const [a, b] = await Promise.all([pictures.at(p), pictures.at(p)]);
    expect(a).toEqual(bits);
    expect(b).toBe(a);
    expect(pictures.now(p)).toEqual({ state: 'here', value: a });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('never fetches what the viewer sent', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const p = picture();
    pictures.keep(p, bits);
    expect(await pictures.at(p)).toBe(bits);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps only what fits the size the server gave', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => answer(await bytes()))
    );
    const p = { ...picture(), width: 16 };
    pictures.keep(p, bits);
    expect(pictures.now(p)).toEqual({ state: 'unknown' });
  });

  it('decodes the bytes the server keeps for a movie', async () => {
    const frames = {
      width: 16,
      height: 2,
      count: 2,
      bytes: new Uint8Array(8).fill(0xf0),
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => answer(encodeMovie(frames)))
    );
    expect(
      await movies.at({
        width: 16,
        height: 2,
        frames: 2,
        url: `/media/t${++n}/movie`,
      })
    ).toEqual(frames);
  });

  it('asks again after the server failed for a moment', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(answer('Unavailable', 503, 'text/plain'))
        .mockResolvedValue(answer(await bytes()))
    );
    const p = picture();
    expect(await pictures.at(p)).toBeNull();
    expect(pictures.now(p)).toEqual({ state: 'failed' });
    expect(await pictures.at(p)).toEqual(bits);
  });

  it('asks again for an address that was missing', async () => {
    // An avatar's address names its contents: missing now, there later.
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(answer(null, 404))
        .mockResolvedValue(answer(await bytes()))
    );
    const avatar = { width: 8, height: 2, url: `/avatars/u${++n}/v1` };
    expect(await pictures.at(avatar)).toBeNull();
    expect(await pictures.at(avatar)).toEqual(bits);
  });

  it("takes nothing but the server's bytes", async () => {
    // A development server answering with the app, say.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => answer('<!DOCTYPE html><html>…', 200, 'text/html'))
    );
    const movie = {
      width: 64,
      height: 48,
      frames: 8,
      url: `/media/t${++n}/movie`,
    };
    expect(await movies.at(movie)).toBeNull();
    expect(movies.now(movie)).toEqual({ state: 'failed' });
  });

  it('keeps bytes that never decode as none, and never asks again', async () => {
    const fetch = vi.fn(async () => answer(Uint8Array.of(1, 2, 3)));
    vi.stubGlobal('fetch', fetch);
    const p = picture();
    expect(await pictures.at(p)).toBeNull();
    expect(pictures.now(p)).toEqual({ state: 'none' });
    expect(await pictures.at(p)).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps what the viewer sent, whatever a fetch of it meanwhile answers', async () => {
    let respond = (_: Response) => undefined as void;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>((done) => (respond = done)))
    );
    const p = picture();
    const shown = pictures.at(p);
    pictures.keep(p, bits);
    respond(answer(null, 502));
    expect(await shown).toBe(bits);
    expect(pictures.now(p)).toEqual({ state: 'here', value: bits });
  });

  it('forgets everything when someone else may be signing in', async () => {
    const p = picture();
    pictures.keep(p, bits);
    forgetMedia();
    expect(pictures.now(p)).toEqual({ state: 'unknown' });
  });
});
