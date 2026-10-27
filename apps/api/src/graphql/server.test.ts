import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { createClient, type Client } from 'graphql-ws';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import {
  byteLength,
  encodeMovie,
  MAX_FRAMES,
  MAX_SIDE,
  toBase64,
} from '@msgr/media';
import type { MessageEvents } from '../application/ports.js';
import { GiphyMedia } from '../domain/gif.js';
import type { User } from '../domain/user.js';
import { pictureVersion } from '../domain/picture.js';
import { MAX_UPLOAD_BYTES } from '../domain/upload.js';
import { createPubSubMessageEvents } from '../infrastructure/message-events.js';
import { examplePicture, pictureInput } from '../testing/pictures.js';
import { movieUpload } from '../testing/uploads.js';
import {
  createTestApp,
  fakeGiphy,
  fakeHash,
  TEST_JWT_SECRET,
} from '../testing/harness.js';
import { MAX_SUBSCRIPTIONS, startServer, type Server } from './server.js';

const LOGIN = `mutation { login(email: "ada@example.com", password: "secret") { token } }`;
const APP_ORIGIN = 'http://localhost:4200';

/** A WebSocket that sends headers the way a browser would. */
const socketWith = (headers: Record<string, string>) =>
  class extends WebSocket {
    constructor(address: string, protocols?: string | string[]) {
      super(address, protocols, { headers });
    }
  };

const SCRIPT = 'console.log("msgr")';

let largest: Uint8Array | undefined;
/** The largest movie a message can carry, noise in every frame, coded. */
const largestMovie = () => (largest ??= codeLargestMovie());
function codeLargestMovie() {
  const size = byteLength(MAX_SIDE, MAX_SIDE) * MAX_FRAMES;
  // xorshift32: noise the coder can't foretell, so it codes to its full size.
  let seed = 2463534242;
  const bytes = Uint8Array.from({ length: size }, () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return seed & 0xff;
  });
  return encodeMovie({
    width: MAX_SIDE,
    height: MAX_SIDE,
    count: MAX_FRAMES,
    bytes,
  });
}

/** A built frontend: an index page, a file, and a hashed asset compressed ahead of time. */
function builtApp() {
  const dir = mkdtempSync(join(tmpdir(), 'msgr-app-'));
  writeFileSync(join(dir, 'index.html'), '<title>Msgr</title>');
  writeFileSync(join(dir, 'app.js'), SCRIPT);
  mkdirSync(join(dir, 'assets'));
  const asset = join(dir, 'assets', 'index-abc123.js');
  writeFileSync(asset, SCRIPT);
  writeFileSync(`${asset}.br`, brotliCompressSync(SCRIPT));
  writeFileSync(`${asset}.gz`, gzipSync(SCRIPT));
  return dir;
}

/** What `startServer` needs to know, for a server of a test's own. */
const testConfig = {
  port: 0,
  corsOrigin: 'http://localhost:4200',
  jwtSecret: TEST_JWT_SECRET,
  sessionTtlSeconds: 60,
  secureCookies: false,
  staticDir: null,
  push: null,
  admins: [],
  storageLimit: null,
  giphyKey: null,
};

describe('server', () => {
  const events = createPubSubMessageEvents();
  let listening = () => undefined as void;
  /** Resolves when the next subscription reaches the event bus. */
  const nextSubscription = () =>
    new Promise<void>((resolve) => (listening = resolve));
  const observedEvents: MessageEvents = {
    publish: (message, recipients) => events.publish(message, recipients),
    subscribe(recipient) {
      const feed = events.subscribe(recipient);
      listening();
      return feed;
    },
  };
  const app = createTestApp({ events: observedEvents });
  let server: Server;
  let ada: User;

  const post = (query: string, cookie?: string) =>
    fetch(server.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(cookie && { cookie }),
      },
      body: JSON.stringify({ query }),
    });

  beforeAll(async () => {
    ada = await app.fixtures.user({
      name: 'Ada',
      email: 'ada@example.com',
      passwordHash: fakeHash('secret'),
    });
    server = await startServer(app.deps, {
      ...testConfig,
      corsOrigin: APP_ORIGIN,
      staticDir: builtApp(),
    });
  });

  afterAll(() => server.stop());

  it('keeps the HTTP session in an httpOnly cookie', async () => {
    const login = await post(LOGIN);
    const setCookie = login.headers.get('set-cookie') ?? '';
    const session = setCookie.split(';')[0];

    expect(setCookie).toMatch(
      /^token=.+; Max-Age=60; Path=\/;.*HttpOnly; SameSite=Lax$/
    );
    expect(await (await post('{ me { name } }', session)).json()).toEqual({
      data: { me: { name: 'Ada' } },
    });

    const logout = await post('mutation { logout }', session);
    expect(logout.headers.get('set-cookie')).toMatch(
      /^token=; Path=\/; Expires=Thu, 01 Jan 1970/
    );
    // Media kept by the browser goes too.
    expect(logout.headers.get('clear-site-data')).toBe('"cache"');
  });

  it('takes the largest movie a message can carry, noise in every frame, as a shell one version behind sends it', async () => {
    const notes = await app.fixtures.groupChat('Notes', [ada]);
    const movie = {
      width: MAX_SIDE,
      height: MAX_SIDE,
      frames: MAX_FRAMES,
      bits: toBase64(largestMovie()),
    };
    const response = await fetch(server.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: await sessionCookie(),
      },
      body: JSON.stringify({
        query:
          'mutation ($input: SendMessageInput!) { sendMessage(input: $input) { movie { frames } } }',
        variables: { input: { chatId: notes.id, movie } },
      }),
    });

    expect(await response.json()).toEqual({
      data: { sendMessage: { movie: { frames: MAX_FRAMES } } },
    });
  });

  describe("a message's picture, movie or sound, put to its address before it's sent", () => {
    const ID = '3f0e1c2a-9b4d-4c8e-a1f2-0123456789ab';
    const site = () => server.url.replace(/\/graphql$/, '');
    const cookieOf = async (user: User) =>
      `token=${await app.deps.tokens.issue(user.id)}`;
    const put = (
      path: string,
      body: Uint8Array,
      headers: Record<string, string> = {}
    ) =>
      fetch(`${site()}${path}`, {
        method: 'PUT',
        headers: {
          'content-type': 'application/octet-stream',
          origin: APP_ORIGIN,
          ...headers,
        },
        body,
      });
    const sendUploaded = async (cookie: string, chatId: string, id: string) =>
      (
        await fetch(server.url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', cookie },
          body: JSON.stringify({
            query:
              'mutation ($input: SendMessageInput!) { sendMessage(input: $input) { id movie { frames url } } }',
            variables: { input: { id, chatId, uploaded: 'MOVIE' } },
          }),
        })
      ).json();

    it('takes the largest movie raw, then the message that names it, and serves it at that address', async () => {
      const notes = await app.fixtures.groupChat('Notes', [ada]);
      const cookie = await cookieOf(ada);
      const coded = largestMovie();
      const path = `/media/${ID}/movie?width=${MAX_SIDE}&height=${MAX_SIDE}&frames=${MAX_FRAMES}`;

      const response = await put(path, coded, { cookie });
      expect(response.status).toBe(204);
      expect(response.headers.get('cache-control')).toBe('no-store');
      // Not there to fetch until its message is stored.
      expect(
        (await fetch(`${site()}/media/${ID}/movie`, { headers: { cookie } }))
          .status
      ).toBe(404);

      expect(await sendUploaded(cookie, notes.id, ID)).toEqual({
        data: {
          sendMessage: {
            id: ID,
            movie: { frames: MAX_FRAMES, url: `/media/${ID}/movie` },
          },
        },
      });
      const served = await fetch(`${site()}/media/${ID}/movie`, {
        headers: { cookie },
      });
      // Compared whole, not element by element: it's 0.7 MB.
      expect(Buffer.from(await served.arrayBuffer()).equals(coded)).toBe(true);
      // Put again, as Try Again would after a lost answer: nothing changes.
      expect((await put(path, coded, { cookie })).status).toBe(204);
      expect(await sendUploaded(cookie, notes.id, ID)).toMatchObject({
        data: { sendMessage: { id: ID } },
      });
    });

    it('says why it refuses what it was given, and refuses before reading what it can’t take', async () => {
      const cookie = await cookieOf(ada);
      const other = '3f0e1c2a-9b4d-4c8e-a1f2-0000000000aa';
      const picture = (query: string) => `/media/${other}/picture${query}`;
      const ink = new Uint8Array(
        await new Response(
          new Blob([new Uint8Array([0x80])])
            .stream()
            .pipeThrough(new CompressionStream('deflate-raw'))
        ).arrayBuffer()
      );

      const blank = await put(
        picture('?width=8&height=1'),
        new Uint8Array([3, 0]),
        {
          cookie,
        }
      );
      expect(blank.status).toBe(422);
      expect(blank.headers.get('cache-control')).toBe('no-store');
      expect(await blank.text()).toBe('Picture does not match its size');
      for (const [query, reason] of [
        ['', 'Picture must be 1 to 320 pixels a side'],
        ['?width=8&height=x', 'Picture must be 1 to 320 pixels a side'],
        ['?width=1e3&height=1', 'Picture must be 1 to 320 pixels a side'],
      ] as const) {
        const response = await put(picture(query), ink, { cookie });
        expect([response.status, await response.text()]).toEqual([422, reason]);
      }
      expect(
        await (
          await put(`/media/not-a-uuid/picture?width=8&height=1`, ink, {
            cookie,
          })
        ).text()
      ).toBe('A message id is a version 4 UUID');

      for (const [path, headers, status] of [
        // No session.
        [picture('?width=8&height=1'), {}, 401],
        // Another site.
        [
          picture('?width=8&height=1'),
          { cookie, origin: 'https://evil.example' },
          403,
        ],
        // No part a message has, or no id one can have.
        [`/media/${other}/anything?width=8&height=1`, { cookie }, 404],
        ['/media/a%00b/picture?width=8&height=1', { cookie }, 404],
      ] as const) {
        expect((await put(path, ink, headers)).status).toBe(status);
      }
      expect(
        (
          await put(
            picture('?width=8&height=1'),
            new Uint8Array(MAX_UPLOAD_BYTES + 1),
            {
              cookie,
            }
          )
        ).status
      ).toBe(413);
      expect(
        (await put(picture('?width=8&height=1'), ink, { cookie })).status
      ).toBe(204);
    });

    it("refuses an id that's taken by someone else's upload", async () => {
      const grace = await app.fixtures.user({ name: 'Grace' });
      const taken = '3f0e1c2a-9b4d-4c8e-a1f2-0000000000bb';
      const { bytes: coded } = movieUpload(13, 7, 3);
      const path = `/media/${taken}/movie?width=13&height=7&frames=3`;
      expect(
        (await put(path, coded, { cookie: await cookieOf(grace) })).status
      ).toBe(204);

      const response = await put(path, coded, { cookie: await cookieOf(ada) });
      expect([response.status, await response.text()]).toEqual([
        422,
        'That message id is taken',
      ]);
    });
  });

  it('runs a mutation that does one thing, and refuses one that does many', async () => {
    const notes = await app.fixtures.groupChat('Notes', [ada]);
    const cookie = await sessionCookie();
    const send = (query: string) =>
      fetch(server.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ query, variables: { chatId: notes.id } }),
      }).then((response) => response.json());
    const one = 'sendMessage(input: { chatId: $chatId, content: "hi" }) { id }';

    // Aliases, or a fragment, would otherwise send thousands in one request.
    for (const query of [
      `mutation ($chatId: ID!) { a: ${one} b: ${one} }`,
      `mutation ($chatId: ID!) { a: ${one} ...More } fragment More on Mutation { b: ${one} }`,
    ]) {
      expect(await send(query)).toMatchObject({
        errors: [{ extensions: { code: 'GRAPHQL_VALIDATION_FAILED' } }],
      });
    }
    expect(
      await app.services().messages.list(ada, { chatId: notes.id })
    ).toEqual({ ok: true, value: [] });
    expect(await send(`mutation ($chatId: ID!) { ${one} }`)).toMatchObject({
      data: { sendMessage: { id: expect.any(String) } },
    });
  });

  /** The next message Ada's feed delivers over `client`. */
  async function receiveOver(client: Client) {
    const notes = await app.fixtures.groupChat('Notes', [ada]);
    const subscribed = nextSubscription();
    const stream = client.iterate({
      query: 'subscription { messageReceived { content } }',
    });
    const received = stream.next();
    await subscribed;
    await new Promise((resolve) => setTimeout(resolve, 20));
    await app
      .services()
      .messages.send(ada, { chatId: notes.id, content: 'over the wire' });
    const { value } = await received;
    await stream.return?.();
    return value;
  }

  const sessionCookie = async () =>
    ((await post(LOGIN)).headers.get('set-cookie') ?? '').split(';')[0] ?? '';

  it('takes only subscriptions over the socket; messages are sent over HTTP', async () => {
    const notes = await app.fixtures.groupChat('Notes', [ada]);
    const { data } = (await (await post(LOGIN)).json()) as {
      data: { login: { token: string } };
    };
    const client = createClient({
      url: server.url.replace(/^http/, 'ws'),
      webSocketImpl: WebSocket,
      connectionParams: { token: data.login.token },
    });

    try {
      const sent = client.iterate({
        query: `mutation { sendMessage(input: { chatId: "${notes.id}", content: "hi" }) { id } }`,
      });
      await expect(sent.next()).rejects.toMatchObject([
        { message: 'Only subscriptions go over the socket.' },
      ]);
      expect(
        await app.services().messages.list(ada, { chatId: notes.id })
      ).toEqual({ ok: true, value: [] });
    } finally {
      await client.dispose();
    }
  });

  it(`lets a socket hold ${MAX_SUBSCRIPTIONS} subscriptions, and no more`, async () => {
    const { data } = (await (await post(LOGIN)).json()) as {
      data: { login: { token: string } };
    };
    const client = createClient({
      url: server.url.replace(/^http/, 'ws'),
      webSocketImpl: WebSocket,
      connectionParams: { token: data.login.token },
    });
    const refused: unknown[] = [];
    const stops: (() => void)[] = [];
    const subscribe = () =>
      new Promise<void>((settled) => {
        stops.push(
          client.subscribe(
            { query: 'subscription { typing { chatId } }' },
            {
              next: () => undefined,
              error: (error) => {
                refused.push(error);
                settled();
              },
              complete: settled,
            }
          )
        );
        // Held, unless refused at once.
        setTimeout(settled, 50);
      });

    try {
      for (let i = 0; i < MAX_SUBSCRIPTIONS; i++) await subscribe();
      expect(refused).toEqual([]);
      await subscribe();
      expect(refused).toEqual([
        [
          expect.objectContaining({
            message: `A connection may hold at most ${MAX_SUBSCRIPTIONS} subscriptions.`,
          }),
        ],
      ]);
      // One let go makes room again.
      stops[0]?.();
      await new Promise((wait) => setTimeout(wait, 50));
      await subscribe();
      expect(refused).toHaveLength(1);
    } finally {
      await client.dispose();
    }
  });

  it('authenticates subscriptions with the token from login', async () => {
    const { data } = (await (await post(LOGIN)).json()) as {
      data: { login: { token: string } };
    };
    const client = createClient({
      url: server.url.replace(/^http/, 'ws'),
      webSocketImpl: WebSocket,
      connectionParams: { token: data.login.token },
    });

    try {
      expect(await receiveOver(client)).toEqual({
        data: { messageReceived: { content: 'over the wire' } },
      });
    } finally {
      await client.dispose();
    }
  });

  it("authenticates a browser's subscriptions with its session cookie", async () => {
    const client = createClient({
      url: server.url.replace(/^http/, 'ws'),
      webSocketImpl: socketWith({
        cookie: await sessionCookie(),
        origin: APP_ORIGIN,
      }),
    });

    try {
      expect(await receiveOver(client)).toEqual({
        data: { messageReceived: { content: 'over the wire' } },
      });
    } finally {
      await client.dispose();
    }
  });

  it('refuses WebSockets opened by any other site', async () => {
    const client = createClient({
      url: server.url.replace(/^http/, 'ws'),
      retryAttempts: 0,
      webSocketImpl: socketWith({
        cookie: await sessionCookie(),
        origin: 'https://evil.example',
      }),
    });
    let closeCode: number | undefined;
    const closed = new Promise<void>((resolve) => {
      client.on('closed', (event) => {
        closeCode = (event as { code: number }).code;
        resolve();
      });
    });

    try {
      const stream = client.iterate({
        query: 'subscription { messageReceived { content } }',
      });
      await stream.next().catch(() => undefined);
      await closed;
      expect(closeCode).toBe(4403);
    } finally {
      await client.dispose();
    }
  });

  it('closes a WebSocket that sends more than a subscription needs', async () => {
    const socket = new WebSocket(
      server.url.replace(/^http/, 'ws'),
      'graphql-transport-ws',
      { headers: { origin: APP_ORIGIN } }
    );
    await new Promise((resolve) => socket.once('open', resolve));
    const closed = new Promise<number>((resolve) =>
      socket.once('close', resolve)
    );

    socket.send('x'.repeat(256 * 1024));

    expect(await closed).toBe(1009);
  });

  it("serves a message's media at its own address, to whoever may see it", async () => {
    const grace = await app.fixtures.user({ name: 'Grace' });
    const notes = await app.fixtures.groupChat('Pictures', [ada]);
    const sent = await app.services().messages.send(ada, {
      chatId: notes.id,
      picture: pictureInput(13, 7),
    });
    if (!sent.ok) throw new Error('not sent');
    const site = server.url.replace(/\/graphql$/, '');
    const fetchAs = (path: string, cookie?: string) =>
      fetch(`${site}${path}`, { headers: cookie ? { cookie } : {} });
    const cookie = await sessionCookie();

    const picture = await fetchAs(`/media/${sent.value.id}/picture`, cookie);
    expect(picture.status).toBe(200);
    expect(picture.headers.get('cache-control')).toBe(
      'private, max-age=31536000, immutable'
    );
    // Kept by the browser for this session alone: whoever signs in next asks again.
    expect(picture.headers.get('vary')).toMatch(/cookie/i);
    expect(new Uint8Array(await picture.arrayBuffer())).toEqual(
      examplePicture(13, 7).deflated
    );

    // No session, someone else's, a part it hasn't: all missing, kept by nobody.
    const graceCookie = `token=${await app.deps.tokens.issue(grace.id)}`;
    for (const [path, as] of [
      [`/media/${sent.value.id}/picture`, undefined],
      [`/media/${sent.value.id}/picture`, graceCookie],
      [`/media/${sent.value.id}/movie`, cookie],
      [`/media/${sent.value.id}/anything`, cookie],
      ['/media/missing/picture', cookie],
      // Each has one address, and an id the database can't hold names nothing.
      [`/MEDIA/${sent.value.id}/picture`, cookie],
      [`/media/${sent.value.id}/picture/`, cookie],
      [`/media/${sent.value.id}`, cookie],
      ['/media/a%00b/picture', cookie],
      [`/avatars/${ada.id}%00/v1`, cookie],
    ] as const) {
      const response = await fetchAs(path, as);
      expect(response.status).toBe(404);
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
  });

  it('serves an avatar at an address that names its version', async () => {
    const saved = await app.services().users.updateProfile(ada, {
      name: 'Ada',
      avatar: pictureInput(64, 64),
    });
    if (!saved.ok || !saved.value.avatar) throw new Error('not saved');
    const site = server.url.replace(/\/graphql$/, '');
    const path = `/avatars/${ada.id}/${pictureVersion(saved.value.avatar)}`;
    const cookie = await sessionCookie();

    const avatar = await fetch(`${site}${path}`, { headers: { cookie } });
    expect(avatar.status).toBe(200);
    expect(new Uint8Array(await avatar.arrayBuffer())).toEqual(
      saved.value.avatar.deflated
    );
    expect((await fetch(`${site}${path}`)).status).toBe(404);
    expect(
      (await fetch(`${site}/avatars/${ada.id}/stale`, { headers: { cookie } }))
        .status
    ).toBe(404);
  });

  it('serves the app, and its client-side routes, from the same address', async () => {
    const site = server.url.replace(/\/graphql$/, '');
    const get = async (path: string) => {
      const response = await fetch(`${site}${path}`);
      return { status: response.status, body: await response.text() };
    };

    const page = await fetch(site);
    expect(page.headers.get('content-security-policy')).toContain(
      "default-src 'self'"
    );
    // A video the viewer picks plays from a blob URL, to be made a movie.
    expect(page.headers.get('content-security-policy')).toContain(
      "media-src 'self' blob:"
    );
    expect(page.headers.get('x-frame-options')).toBe('DENY');
    expect(page.headers.get('x-content-type-options')).toBe('nosniff');

    expect(await get('/')).toEqual({
      status: 200,
      body: '<title>Msgr</title>',
    });
    expect(await get('/cm0chat123')).toEqual({
      status: 200,
      body: '<title>Msgr</title>',
    });
    expect(await get('/app.js')).toEqual({
      status: 200,
      body: 'console.log("msgr")',
    });
    expect(await (await post('{ __typename }')).json()).toEqual({
      data: { __typename: 'Query' },
    });
  });

  it('sends what the build compressed, and keeps hashed assets for a year', async () => {
    const site = server.url.replace(/\/graphql$/, '');
    const asset = (encoding: string) =>
      fetch(`${site}/assets/index-abc123.js`, {
        headers: { 'accept-encoding': encoding },
      });

    // fetch decompresses as it reads, so the body is the script either way.
    for (const [accepted, sent] of [
      ['gzip, deflate, br, zstd', 'br'],
      ['gzip', 'gzip'],
      ['identity', null],
    ] as const) {
      const response = await asset(accepted);
      expect(response.headers.get('content-encoding')).toBe(sent);
      expect(response.headers.get('content-type')).toMatch(/javascript/);
      expect(response.headers.get('vary')).toBe('Accept-Encoding');
      expect(response.headers.get('cache-control')).toBe(
        'public, max-age=31536000, immutable'
      );
      expect(await response.text()).toBe(SCRIPT);
    }

    // A missing asset is missing, not the app in its place.
    expect((await fetch(`${site}/assets/index-gone.js`)).status).toBe(404);
    // The app itself is asked about again each time.
    expect((await fetch(site)).headers.get('cache-control')).toBe(
      'public, max-age=0'
    );
  });

  it('says nothing about itself, and keeps other windows out', async () => {
    const page = await fetch(server.url.replace(/\/graphql$/, ''));
    expect(page.headers.get('x-powered-by')).toBeNull();
    expect(page.headers.get('cross-origin-opener-policy')).toBe('same-origin');
    // Only for an https address, which this isn't.
    expect(page.headers.get('strict-transport-security')).toBeNull();
  });
});

describe('a server that is starting', () => {
  /** The database being brought up to date, finished by the test. */
  const gate = () => {
    let open = () => undefined as void;
    const ready = new Promise<void>((done) => (open = done));
    return { ready, open };
  };
  /** Whether a request has been answered within a moment, without waiting longer. */
  const answeredSoon = async (request: Promise<Response>) =>
    Promise.race([
      request.then(() => true),
      new Promise<false>((done) => setTimeout(() => done(false), 100)),
    ]);

  it('serves the app at once, and GraphQL and its health once the database is ready', async () => {
    const { ready, open } = gate();
    const starting = await startServer(
      createTestApp().deps,
      { ...testConfig, staticDir: builtApp() },
      ready
    );
    const site = starting.url.replace(/\/graphql$/, '');
    try {
      expect((await fetch(`${site}/some-chat`)).status).toBe(200);

      // A host switches traffic to a new instance once its health check
      // passes: one whose migration is running, or about to fail, isn't ready.
      const health = fetch(`${site}/healthz`);
      const query = fetch(starting.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: '{ __typename }' }),
      });
      const media = fetch(`${site}/media/m1/picture`);
      expect(await answeredSoon(health)).toBe(false);
      expect(await answeredSoon(query)).toBe(false);
      expect(await answeredSoon(media)).toBe(false);

      open();
      expect((await media).status).toBe(404);
      expect((await health).status).toBe(204);
      expect((await health).headers.get('cache-control')).toBe('no-store');
      expect(await (await query).json()).toEqual({
        data: { __typename: 'Query' },
      });
    } finally {
      await starting.stop();
    }
  });

  it('holds a socket until the database is ready', async () => {
    const { ready, open } = gate();
    const starting = await startServer(createTestApp().deps, testConfig, ready);
    let acknowledged = false;
    const client = createClient({
      url: starting.url.replace(/^http/, 'ws'),
      webSocketImpl: WebSocket,
      lazy: false,
      retryAttempts: 0,
      on: { connected: () => (acknowledged = true) },
    });
    try {
      await new Promise((wait) => setTimeout(wait, 100));
      expect(acknowledged).toBe(false);
      open();
      await new Promise((wait) => setTimeout(wait, 100));
      expect(acknowledged).toBe(true);
    } finally {
      await client.dispose();
      await starting.stop();
    }
  });
});

describe('the built app, compressed', () => {
  const PAGE = `<!doctype html><title>Msgr</title>${' '.repeat(2048)}`;
  /** A build as vite.config.ts leaves it: index.html compressed too. */
  const compressedApp = () => {
    const dir = mkdtempSync(join(tmpdir(), 'msgr-app-'));
    for (const [file, text] of [
      ['index.html', PAGE],
      ['assets/index-abc123.js', SCRIPT],
    ] as const) {
      mkdirSync(join(dir, file, '..'), { recursive: true });
      writeFileSync(join(dir, file), text);
      writeFileSync(join(dir, `${file}.br`), brotliCompressSync(text));
      writeFileSync(join(dir, `${file}.gz`), gzipSync(text));
    }
    return dir;
  };
  let server: Server;
  let site: string;
  beforeAll(async () => {
    server = await startServer(createTestApp().deps, {
      ...testConfig,
      staticDir: compressedApp(),
    });
    site = server.url.replace(/\/graphql$/, '');
  });
  afterAll(() => server.stop());

  it('is sent compressed at its own address, as at any other route', async () => {
    for (const path of ['/', '/index.html', '/some-chat']) {
      const response = await fetch(`${site}${path}`, {
        headers: { 'accept-encoding': 'br' },
      });
      expect(await response.text()).toBe(PAGE);
      expect([path, response.headers.get('content-encoding')]).toEqual([
        path,
        'br',
      ]);
    }
  });

  it('honours a refusal of brotli, and answers HEAD without a body', async () => {
    const asset = `${site}/assets/index-abc123.js`;
    const refused = await fetch(asset, {
      headers: { 'accept-encoding': 'br;q=0, gzip' },
    });
    expect(refused.headers.get('content-encoding')).toBe('gzip');
    expect(await refused.text()).toBe(SCRIPT);

    for (const path of ['/assets/index-abc123.js', '/some-chat']) {
      const head = await fetch(`${site}${path}`, {
        method: 'HEAD',
        headers: { 'accept-encoding': 'br' },
      });
      expect([path, head.status, head.headers.get('content-encoding')]).toEqual(
        [path, 200, 'br']
      );
      expect(await head.text()).toBe('');
    }
  });

  it('sends HSTS only for an https address', async () => {
    expect(
      (await fetch(site)).headers.get('strict-transport-security')
    ).toBeNull();
    const secure = await startServer(createTestApp().deps, {
      ...testConfig,
      corsOrigin: 'https://msgr.example',
    });
    try {
      const page = await fetch(secure.url.replace(/\/graphql$/, '/healthz'));
      expect(page.headers.get('strict-transport-security')).toBe(
        'max-age=31536000'
      );
    } finally {
      await secure.stop();
    }
  });
});

describe("a defect's own words", () => {
  it('stay on the server, logged, while the client hears only that something went wrong', async () => {
    const app = createTestApp();
    const ada = await app.fixtures.user({ name: 'Ada' });
    app.deps.repositories.chats.findByParticipant = () =>
      Promise.reject(
        new Error("Can't reach database server at db.secret:5432")
      );
    const logged = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const server = await startServer(app.deps, {
      port: 0,
      corsOrigin: APP_ORIGIN,
      jwtSecret: TEST_JWT_SECRET,
      sessionTtlSeconds: 60,
      secureCookies: false,
      staticDir: null,
      push: null,
      admins: [],
      storageLimit: null,
      giphyKey: null,
    });
    try {
      const token = await app.deps.tokens.issue(ada.id);
      const ask = (query: string) =>
        fetch(server.url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            cookie: `token=${token}`,
          },
          body: JSON.stringify({ query }),
        }).then((response) => response.json());

      expect(await ask('{ chats { id } }')).toEqual({
        data: null,
        errors: [
          {
            message: 'Something went wrong',
            path: ['chats'],
            extensions: { code: 'INTERNAL_SERVER_ERROR' },
          },
        ],
      });
      expect(String(logged.mock.calls[0]?.[0])).toContain('db.secret');

      // A domain error, and GraphQL's own, still say what's wrong.
      const refused = (await ask(
        '{ chats { messages { chat { messages { id } } } } }'
      )) as { errors: { message: string }[] };
      expect(refused.errors[0]?.message).toBe(
        'A query may not read messages inside messages.'
      );
    } finally {
      logged.mockRestore();
      await server.stop();
    }
  });

  it('stay on the server when media is asked for, too', async () => {
    const app = createTestApp();
    const ada = await app.fixtures.user({ name: 'Ada' });
    const chat = await app.fixtures.groupChat('Pictures', [ada]);
    const sent = await app.services().messages.send(ada, {
      chatId: chat.id,
      picture: pictureInput(13, 7),
    });
    if (!sent.ok) throw new Error('not sent');
    app.deps.repositories.messages.findMedia = () =>
      Promise.reject(
        new Error("Can't reach database server at db.secret:5432")
      );
    const logged = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const server = await startServer(app.deps, {
      port: 0,
      corsOrigin: APP_ORIGIN,
      jwtSecret: TEST_JWT_SECRET,
      sessionTtlSeconds: 60,
      secureCookies: false,
      staticDir: null,
      push: null,
      admins: [],
      storageLimit: null,
      giphyKey: null,
    });
    try {
      const response = await fetch(
        server.url.replace(/\/graphql$/, `/media/${sent.value.id}/picture`),
        { headers: { cookie: `token=${await app.deps.tokens.issue(ada.id)}` } }
      );
      expect(response.status).toBe(500);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.text()).toBe('');
      expect(String(logged.mock.calls[0]?.[0])).toContain('db.secret');
    } finally {
      logged.mockRestore();
      await server.stop();
    }
  });
});

describe('GIPHY’s files', () => {
  const at = (path: string) =>
    GiphyMedia.parse(`https://media.giphy.com/media/${path}`) as GiphyMedia;
  const wave = {
    id: 'wave1',
    title: 'Wave',
    still: at('wave1/100_s.gif'),
    movie: at('wave1/200.mp4?cid=c&ct=g'),
  };
  const giphy = fakeGiphy([wave]);
  const app = createTestApp({ giphy });
  let server: Server;
  let site: string;
  let cookie: string;

  beforeAll(async () => {
    const ada = await app.fixtures.user({ name: 'Ada' });
    cookie = `token=${await app.deps.tokens.issue(ada.id)}`;
    server = await startServer(app.deps, {
      ...testConfig,
      staticDir: builtApp(),
    });
    site = server.url.replace(/\/graphql$/, '');
  });

  afterAll(() => server.stop());

  const fetchAs = (path: string, as?: string) =>
    fetch(`${site}${path}`, { headers: as ? { cookie: as } : {} });

  it('streams one to whoever is signed in, kept a day for their session alone', async () => {
    const movie = await fetchAs(
      `/giphy/media?url=${encodeURIComponent(wave.movie)}`,
      cookie
    );

    expect(movie.status).toBe(200);
    expect(movie.headers.get('content-type')).toBe('video/mp4');
    expect(movie.headers.get('cache-control')).toBe('private, max-age=86400');
    expect(movie.headers.get('vary')).toMatch(/cookie/i);
    // Served as this server's own: the page's rules hold for it too.
    expect(movie.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await movie.text()).toBe(wave.movie);
  });

  it('serves nothing else: no session, another address, nothing GIPHY has', async () => {
    for (const [path, as] of [
      [`/giphy/media?url=${encodeURIComponent(wave.movie)}`, undefined],
      [
        `/giphy/media?url=${encodeURIComponent('https://evil.com/x.gif')}`,
        cookie,
      ],
      [`/giphy/media?url=${encodeURIComponent(at('other/200.mp4'))}`, cookie],
      ['/giphy/media', cookie],
      [`/giphy/media?url=a&url=b`, cookie],
      [`/giphy/media/?url=${encodeURIComponent(wave.movie)}`, cookie],
      [`/GIPHY/media?url=${encodeURIComponent(wave.movie)}`, cookie],
      ['/giphy/anything', cookie],
    ] as const) {
      const response = await fetchAs(path, as);
      expect(response.status, path).toBe(404);
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
  });

  it('cuts short a file that fails on the way, rather than pass it as whole', async () => {
    let sent = 0;
    vi.spyOn(giphy, 'file').mockResolvedValueOnce({
      type: 'video/mp4',
      length: null,
      // Half a movie, then GIPHY stops.
      body: new ReadableStream({
        pull(controller) {
          if (sent++ === 0) {
            controller.enqueue(new TextEncoder().encode('half a movie'));
          } else controller.error(new Error('GIPHY stopped'));
        },
      }),
    });

    // However far it got, the browser never takes it for the whole file.
    const whole = await fetchAs(
      `/giphy/media?url=${encodeURIComponent(wave.movie)}`,
      cookie
    )
      .then((response) => response.text())
      .then(
        () => true,
        () => false
      );
    expect(whole).toBe(false);
  });

  it('fetches nothing for a HEAD, which would send none of it', async () => {
    const file = vi.spyOn(giphy, 'file');

    const response = await fetch(
      `${site}/giphy/media?url=${encodeURIComponent(wave.movie)}`,
      { method: 'HEAD', headers: { cookie } }
    );

    expect(response.status).toBe(404);
    expect(file).not.toHaveBeenCalled();
  });
});
