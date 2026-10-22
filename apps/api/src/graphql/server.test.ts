import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient, type Client } from 'graphql-ws';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import {
  byteLength,
  encodeMovie,
  MAX_FRAMES,
  MAX_SIDE,
  toBase64,
} from '@msgr/media';
import type { MessageEvents } from '../application/ports.js';
import type { User } from '../domain/user.js';
import { createPubSubMessageEvents } from '../infrastructure/message-events.js';
import {
  createTestApp,
  fakeHash,
  TEST_JWT_SECRET,
} from '../testing/harness.js';
import { startServer, type Server } from './server.js';

const LOGIN = `mutation { login(email: "ada@example.com", password: "secret") { token } }`;
const APP_ORIGIN = 'http://localhost:4200';

/** A WebSocket that sends headers the way a browser would. */
const socketWith = (headers: Record<string, string>) =>
  class extends WebSocket {
    constructor(address: string, protocols?: string | string[]) {
      super(address, protocols, { headers });
    }
  };

/** A built frontend: an index page and one asset. */
function builtApp() {
  const dir = mkdtempSync(join(tmpdir(), 'msgr-app-'));
  writeFileSync(join(dir, 'index.html'), '<title>Msgr</title>');
  writeFileSync(join(dir, 'app.js'), 'console.log("msgr")');
  return dir;
}

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
      port: 0,
      corsOrigin: APP_ORIGIN,
      jwtSecret: TEST_JWT_SECRET,
      sessionTtlSeconds: 60,
      secureCookies: false,
      staticDir: builtApp(),
      push: null,
      admins: [],
      storageLimit: null,
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
  });

  it('takes the largest movie a message can carry, noise in every frame', async () => {
    const notes = await app.fixtures.groupChat('Notes', [ada]);
    const size = byteLength(MAX_SIDE, MAX_SIDE) * MAX_FRAMES;
    // xorshift32: noise the coder can't foretell, so it codes to its full size.
    let seed = 2463534242;
    const bytes = Uint8Array.from({ length: size }, () => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return seed & 0xff;
    });
    const movie = {
      width: MAX_SIDE,
      height: MAX_SIDE,
      frames: MAX_FRAMES,
      bits: toBase64(
        encodeMovie({
          width: MAX_SIDE,
          height: MAX_SIDE,
          count: MAX_FRAMES,
          bytes,
        })
      ),
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
});
