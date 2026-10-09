import { createClient } from 'graphql-ws';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
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

describe('server', () => {
  const events = createPubSubMessageEvents();
  let listening: () => void;
  const subscribed = new Promise<void>((resolve) => (listening = resolve));
  // Tells the test when a subscription has reached the event bus.
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
      corsOrigin: 'http://localhost:4200',
      jwtSecret: TEST_JWT_SECRET,
      sessionTtlSeconds: 60,
      secureCookies: false,
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

  it('authenticates subscriptions with the token from login', async () => {
    const { data } = (await (await post(LOGIN)).json()) as {
      data: { login: { token: string } };
    };
    const client = createClient({
      url: server.url.replace(/^http/, 'ws'),
      webSocketImpl: WebSocket,
      connectionParams: { token: data.login.token },
    });
    const notes = await app.fixtures.groupChat('Notes', [ada]);

    try {
      const stream = client.iterate({
        query: 'subscription { messageReceived { content } }',
      });
      const received = stream.next();
      await subscribed;
      await new Promise((resolve) => setTimeout(resolve, 20));
      await app
        .services()
        .messages.send(ada, { chatId: notes.id, content: 'over the wire' });

      expect((await received).value).toEqual({
        data: { messageReceived: { content: 'over the wire' } },
      });
      await stream.return?.();
    } finally {
      await client.dispose();
    }
  });
});
