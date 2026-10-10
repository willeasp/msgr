import { createServer, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Url } from '../domain/link.js';
import { createLinkPreviewer } from './link-previewer.js';

/*
 * A local web server stands in for the internet. The address check is passed
 * in to allow it (127.0.0.1 is refused by default, as one test shows).
 */

let server: Server;
let base: string;
let port: number;
let png: Buffer;
let open = 0;
let mostOpen = 0;
let hugeFinished = false;

const html = (head: string) =>
  `<!doctype html><html><head>${head}</head><body></body></html>`;
const page = (image = '/image.png') =>
  html(`<meta property="og:title" content="A page">
    <meta property="og:site_name" content="Local">
    <meta property="og:description" content="Served from this test">
    <meta property="og:image" content="${image}">`);

function send(res: ServerResponse, type: string, body: string | Buffer) {
  res.writeHead(200, { 'content-type': type });
  res.end(body);
}

beforeAll(async () => {
  png = await sharp({
    create: { width: 200, height: 100, channels: 3, background: '#000' },
  })
    .composite([
      {
        input: await sharp({
          create: { width: 100, height: 100, channels: 3, background: '#fff' },
        })
          .png()
          .toBuffer(),
        left: 100,
        top: 0,
      },
    ])
    .png()
    .toBuffer();

  server = createServer(async (req, res) => {
    const path = req.url ?? '/';
    if (path === '/page') return send(res, 'text/html; charset=utf-8', page());
    if (path === '/image.png') return send(res, 'image/png', png);
    const redirect = /^\/r(\d)$/.exec(path);
    if (redirect) {
      const left = Number(redirect[1]);
      res.writeHead(302, { location: left > 1 ? `/r${left - 1}` : '/page' });
      return res.end();
    }
    if (path === '/slow') {
      res.writeHead(200, { 'content-type': 'text/html' });
      return; // and never finish
    }
    if (path === '/huge') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.write(page());
      const chunk = 'x'.repeat(64 * 1024);
      for (let sent = 0; sent < 2 * 1024 * 1024; sent += chunk.length) {
        if (res.destroyed) return;
        if (!res.write(chunk)) {
          await new Promise((resolve) => {
            res.once('drain', resolve);
            res.once('close', resolve);
          });
        }
      }
      hugeFinished = true;
      return res.end();
    }
    if (path === '/json')
      return send(res, 'application/json', '{"title":"no"}');
    if (path === '/broken') return send(res, 'text/html', page('/broken.png'));
    if (path === '/broken.png') return send(res, 'image/png', 'not a picture');
    if (path === '/big') return send(res, 'text/html', page('/big.png'));
    if (path === '/big.png') {
      res.writeHead(200, {
        'content-type': 'image/png',
        'content-length': '6000000',
      });
      return res.write(png); // claims far more than it sends
    }
    if (path === '/elsewhere')
      return send(res, 'text/html', page(`http://127.0.0.2:${port}/image.png`));
    if (path.startsWith('/busy')) {
      open++;
      mostOpen = Math.max(mostOpen, open);
      await new Promise((resolve) => setTimeout(resolve, 50));
      open--;
      return send(res, 'text/html', page('none'));
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
  base = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

const url = (path: string) => {
  const parsed = Url.parse(`${base}${path}`);
  if (!parsed) throw new Error(path);
  return parsed;
};
const local = (overrides: { isAllowed?: (address: string) => boolean } = {}) =>
  createLinkPreviewer({
    isAllowed: () => true,
    ports: [port],
    timeoutMs: 500,
    ...overrides,
  });
const bits = (thumbnail: string) =>
  Uint8Array.from(atob(thumbnail), (c) => c.charCodeAt(0));

describe('the link previewer', () => {
  it("reads a page's card, and dithers its picture into a thumbnail", async () => {
    const preview = await local().preview(url('/page'));

    expect(preview).toMatchObject({
      url: url('/page'),
      site: 'Local',
      title: 'A page',
      description: 'Served from this test',
    });
    const thumbnail = bits(preview?.thumbnail ?? '');
    expect(thumbnail).toHaveLength(512);
    // The picture is black then white: cropped square, ink left, paper right.
    expect(thumbnail[0]).toBe(0xff);
    expect(thumbnail[7]).toBe(0x00);
  });

  it('follows three redirects, checking each hop, but not a fourth', async () => {
    const isAllowed = vi.fn(() => true);

    expect(await local({ isAllowed }).preview(url('/r3'))).toMatchObject({
      title: 'A page',
      url: url('/r3'),
    });
    expect(isAllowed.mock.calls.length).toBeGreaterThanOrEqual(4);
    expect(await local().preview(url('/r4'))).toBeNull();
  });

  it('gives up on a page that never finishes', async () => {
    expect(
      await createLinkPreviewer({
        isAllowed: () => true,
        ports: [port],
        timeoutMs: 200,
      }).preview(url('/slow'))
    ).toBeNull();
  });

  it('reads only the start of a huge page, and stops downloading it', async () => {
    expect(await local().preview(url('/huge'))).toMatchObject({
      title: 'A page',
    });
    expect(hugeFinished).toBe(false);
  });

  it('previews only HTML', async () => {
    expect(await local().preview(url('/json'))).toBeNull();
  });

  it('keeps the card without a picture that is broken, too big, or somewhere refused', async () => {
    const isAllowed = vi.fn((address: string) => address === '127.0.0.1');

    for (const path of ['/broken', '/big']) {
      const preview = await local().preview(url(path));
      expect(preview, path).toMatchObject({ title: 'A page', thumbnail: null });
    }
    expect(await local({ isAllowed }).preview(url('/elsewhere'))).toMatchObject(
      {
        title: 'A page',
        thumbnail: null,
      }
    );
    expect(isAllowed).toHaveBeenCalledWith('127.0.0.2');
  });

  it('refuses this machine with the real address check', async () => {
    expect(
      await createLinkPreviewer({ ports: [port] }).preview(url('/page'))
    ).toBeNull();
  });

  it('refuses ports other than the allowed ones', async () => {
    expect(
      await createLinkPreviewer({ isAllowed: () => true }).preview(url('/page'))
    ).toBeNull();
  });

  it('fetches at most two pages at once', async () => {
    const previewer = local();
    mostOpen = 0;

    await Promise.all(
      [1, 2, 3, 4, 5].map((i) => previewer.preview(url(`/busy${i}`)))
    );

    expect(mostOpen).toBe(2);
  });
});
