import { describe, expect, it } from 'vitest';
import { Url } from './link.js';
import {
  THUMBNAIL_SIZE,
  ditherThumbnail,
  readPreview,
} from './link-preview.js';

const page = Url.parse('https://www.example.com/articles/1');
if (!page) throw new Error('fixture URL');

describe('readPreview', () => {
  it("reads a page's Open Graph tags, in any attribute order and quotes", () => {
    const html = `<html><head>
      <meta property="og:title" content="A title">
      <meta content='Example Site' property='og:site_name'>
      <meta property="og:description" content="What it is about">
      <meta property="og:image" content="/pictures/cover.jpg">
    </head></html>`;

    expect(readPreview(html, page)).toEqual({
      title: 'A title',
      site: 'Example Site',
      description: 'What it is about',
      image: 'https://www.example.com/pictures/cover.jpg',
    });
  });

  it('falls back to the <title>, the description tag and the host', () => {
    const html = `<title> Plain   page </title><meta name="description" content="Plainly described">`;

    expect(readPreview(html, page)).toEqual({
      title: 'Plain page',
      site: 'example.com',
      description: 'Plainly described',
      image: null,
    });
  });

  it('decodes entities and cuts long text', () => {
    const html = `<meta property="og:title" content="Tom &amp; Jerry&#39;s &#x27;show&#x27; &quot;live&quot;">
      <meta property="og:description" content="${'word '.repeat(80)}">`;
    const preview = readPreview(html, page);

    expect(preview?.title).toBe(`Tom & Jerry's 'show' "live"`);
    expect(preview?.description).toHaveLength(200);
    expect(preview?.description?.endsWith('…')).toBe(true);
  });

  it('cuts a long title to 120 characters', () => {
    const preview = readPreview(`<title>${'t'.repeat(300)}</title>`, page);
    expect(preview?.title).toHaveLength(120);
    expect(preview?.title.endsWith('…')).toBe(true);
  });

  it('reads hostile pages in linear time', () => {
    const size = 64 * 1024;
    for (const html of [
      `<meta ${'a'.repeat(size)}>`,
      '<meta '.repeat(size / 6),
      '<title>'.repeat(size / 7),
      `<meta content="${'x'.repeat(size)}`,
      `<meta ${'a="b" '.repeat(size / 6)}>`,
    ]) {
      const start = performance.now();
      readPreview(html, page);
      expect(performance.now() - start).toBeLessThan(50);
    }
  });

  it('turns character codes that are not characters into replacement marks', () => {
    expect(
      readPreview('<title>&#x110000; and &#99999999;</title>', page)?.title
    ).toBe('\uFFFD and \uFFFD');
  });

  it('gives nothing for a page without a title, and no picture for a bad one', () => {
    expect(readPreview('<p>no head at all</p>', page)).toBeNull();
    expect(
      readPreview(
        `<title>T</title><meta property="og:image" content="javascript:alert(1)">`,
        page
      )?.image
    ).toBeNull();
  });
});

describe('ditherThumbnail', () => {
  const grey = (value: number) =>
    new Uint8Array(THUMBNAIL_SIZE * THUMBNAIL_SIZE).fill(value);
  const bytes = (thumbnail: string) =>
    Uint8Array.from(atob(thumbnail), (c) => c.charCodeAt(0));
  const inkShare = (thumbnail: string) =>
    [...bytes(thumbnail)].reduce(
      (sum, byte) => sum + byte.toString(2).replaceAll('0', '').length,
      0
    ) /
    (THUMBNAIL_SIZE * THUMBNAIL_SIZE);

  it('packs 64×64 pixels into 512 bytes: white is paper, black is ink', () => {
    expect(bytes(ditherThumbnail(grey(255)))).toEqual(new Uint8Array(512));
    expect(bytes(ditherThumbnail(grey(0)))).toEqual(
      new Uint8Array(512).fill(0xff)
    );
  });

  it('dithers a mid grey to about half ink', () => {
    const share = inkShare(ditherThumbnail(grey(128)));
    expect(share).toBeGreaterThan(0.4);
    expect(share).toBeLessThan(0.6);
  });
});
