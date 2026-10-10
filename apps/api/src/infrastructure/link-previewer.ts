import { lookup as resolve } from 'node:dns';
import http, { type IncomingMessage } from 'node:http';
import https from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import sharp from 'sharp';
import type { LinkPreviewer } from '../application/ports.js';
import { Url } from '../domain/link.js';
import {
  THUMBNAIL_SIZE,
  ditherThumbnail,
  readPreview,
  type LinkPreview,
  type Thumbnail,
} from '../domain/link-preview.js';
import { isPublicAddress } from './public-address.js';

/*
 * Reads pages for link previews, as a cautious bot. Anyone can post a link, so
 * every request is guarded against reaching anything but the public internet
 * (this machine, Render's or Neon's private network): only http(s) on the
 * allowed ports, every resolved address checked, the connection made to the
 * checked address, each redirect checked again, and every response capped in
 * time and size. URLs are never logged.
 */

export interface LinkPreviewerOptions {
  /** Whether an address may be fetched from; tests allow their own server. */
  readonly isAllowed?: (address: string) => boolean;
  readonly ports?: readonly number[];
  readonly timeoutMs?: number;
}

const PAGE = { accept: 'text/html', type: 'text/html', maxBytes: 512 * 1024 };
const IMAGE = { accept: 'image/*', type: 'image/', maxBytes: 5 * 1024 * 1024 };
const MAX_REDIRECTS = 3;
const AT_ONCE = 2;
// Decoding is where pictures cost memory: a tiny AVIF can claim 5000×5000. Only
// these formats, and only up to 4 megapixels (social cards are about 0.8).
const FORMATS = new Set(['jpeg', 'png', 'webp', 'gif']);
const MAX_PIXELS = 4_000_000;
sharp.cache(false);
sharp.concurrency(1);

class Refused extends Error {}

export function createLinkPreviewer({
  isAllowed = isPublicAddress,
  ports = [80, 443],
  timeoutMs = 5000,
}: LinkPreviewerOptions = {}): LinkPreviewer {
  // Resolves every address for a host and refuses the host if any isn't
  // allowed; the connection then uses exactly the addresses checked here.
  const lookup: LookupFunction = (hostname, options, callback) => {
    resolve(hostname, { all: true }, (error, addresses) => {
      if (error) return callback(error, '', 0);
      if (
        addresses.length === 0 ||
        addresses.some(({ address }) => !isAllowed(address))
      ) {
        return callback(new Refused('address'), '', 0);
      }
      // Node asks for every address when it races IPv4 against IPv6.
      if (options.all) return callback(null, addresses);
      const [first] = addresses;
      if (!first) return callback(new Refused('address'), '', 0);
      callback(null, first.address, first.family);
    });
  };

  async function get(
    url: Url,
    want: typeof PAGE | typeof IMAGE,
    hops = 0
  ): Promise<{ url: Url; body: Buffer }> {
    const target = new URL(url);
    const port = Number(
      target.port || (target.protocol === 'https:' ? 443 : 80)
    );
    if (!ports.includes(port)) throw new Refused('port');
    const host = target.hostname.replace(/^\[|\]$/g, '');
    if (isIP(host) && !isAllowed(host)) throw new Refused('address');

    const response = await new Promise<IncomingMessage>((done, fail) => {
      (target.protocol === 'https:' ? https : http)
        .get(
          target,
          {
            headers: {
              'user-agent': 'MsgrLinkPreview/1.0',
              accept: want.accept,
            },
            lookup,
            agent: false,
            signal: AbortSignal.timeout(timeoutMs),
          },
          done
        )
        .on('error', fail);
    });

    const status = response.statusCode ?? 0;
    const location = response.headers.location;
    if (status >= 300 && status < 400 && location) {
      response.destroy();
      const next = Url.parse(location, url);
      if (!next || hops >= MAX_REDIRECTS) throw new Refused('redirect');
      return get(next, want, hops + 1);
    }
    if (
      status !== 200 ||
      !(response.headers['content-type'] ?? '').startsWith(want.type) ||
      Number(response.headers['content-length'] ?? 0) > want.maxBytes
    ) {
      response.destroy();
      throw new Refused('response');
    }

    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of response) {
      chunks.push(chunk as Buffer);
      size += (chunk as Buffer).length;
      if (size >= want.maxBytes) {
        // Enough: a page's tags come first, and a picture this big is refused.
        response.destroy();
        if (want === IMAGE) throw new Refused('size');
        break;
      }
    }
    return { url, body: Buffer.concat(chunks).subarray(0, want.maxBytes) };
  }

  async function thumbnail(image: Url): Promise<Thumbnail | null> {
    try {
      const { body } = await get(image, IMAGE);
      const picture = sharp(body, {
        limitInputPixels: MAX_PIXELS,
        failOn: 'error',
      });
      // Read from the header alone, before anything is decoded.
      const {
        format,
        compression,
        width = 0,
        height = 0,
      } = await picture.metadata();
      const avif = format === 'heif' && compression === 'av1';
      if (!(avif || (format && FORMATS.has(format)))) return null;
      if (width * height > MAX_PIXELS) return null;
      const grey = await picture
        .flatten({ background: '#ffffff' })
        .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: 'cover' })
        .greyscale()
        .raw()
        .toBuffer();
      if (grey.length !== THUMBNAIL_SIZE * THUMBNAIL_SIZE) return null;
      return ditherThumbnail(new Uint8Array(grey));
    } catch {
      return null;
    }
  }

  async function read(url: Url): Promise<LinkPreview | null> {
    // Nothing a site does may reach the caller as an error: no card instead.
    try {
      const page = await get(url, PAGE);
      const found = readPreview(page.body.toString('utf8'), page.url);
      if (!found) return null;
      return {
        url,
        site: found.site,
        title: found.title,
        description: found.description,
        thumbnail: found.image ? await thumbnail(found.image) : null,
      };
    } catch {
      return null;
    }
  }

  // At most AT_ONCE previews run at a time, so decoding pictures fits in memory.
  let running = 0;
  const waiting: (() => void)[] = [];
  return {
    async preview(url) {
      if (running < AT_ONCE) running++;
      else await new Promise<void>((start) => waiting.push(start));
      try {
        return await read(url);
      } finally {
        // Hand the slot straight to the next in line, if any.
        const next = waiting.shift();
        if (next) next();
        else running--;
      }
    },
  };
}
