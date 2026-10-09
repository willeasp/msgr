import { graphql, parse, subscribe, type ExecutionResult } from 'graphql';
import { describe, expect, it, vi } from 'vitest';
import type { User } from '../domain/user.js';
import { createTestApp, fakeHash, nextEvent } from '../testing/harness.js';
import { createContext } from './context.js';
import { schema } from './server.js';

type TestApp = ReturnType<typeof createTestApp>;

async function contextFor(app: TestApp, viewer?: User) {
  const token = viewer ? await app.deps.tokens.issue(viewer.id) : undefined;
  const cookie = { set: vi.fn(), clear: vi.fn() };
  return createContext(app.deps, { token, cookie, cache: true });
}

async function execute(
  app: TestApp,
  source: string,
  { as, variables }: { as?: User; variables?: Record<string, unknown> } = {}
) {
  const contextValue = await contextFor(app, as);
  const result = await graphql({
    schema,
    source,
    variableValues: variables,
    contextValue,
  });
  return { ...result, cookie: contextValue.cookie };
}

const codeOf = (result: ExecutionResult) =>
  result.errors?.[0]?.extensions['code'];

async function feed(app: TestApp, viewer: User, query: string) {
  const stream = await subscribe({
    schema,
    document: parse(query),
    contextValue: await contextFor(app, viewer),
  });
  if (!(Symbol.asyncIterator in stream)) throw new Error('not a stream');
  return stream;
}

async function world() {
  const app = createTestApp();
  const ada = await app.fixtures.user({
    name: 'Ada',
    email: 'ada@example.com',
    passwordHash: fakeHash('secret'),
  });
  const grace = await app.fixtures.user({ name: 'Grace' });
  const linus = await app.fixtures.user({ name: 'Linus' });
  const team = await app.fixtures.groupChat('Team', [ada, grace, linus]);
  const services = app.services();
  const direct = await services.chats.openDirect(ada, grace.id);
  if (!direct.ok) throw new Error('setup');
  return { app, ada, grace, linus, team, direct: direct.value };
}

describe('authentication', () => {
  it('knows who is asking', async () => {
    const { app, ada } = await world();
    const me = '{ me { name } }';

    expect((await execute(app, me)).data).toEqual({ me: null });
    expect((await execute(app, me, { as: ada })).data).toEqual({
      me: { name: 'Ada' },
    });
  });

  it('keeps everything else behind sign-in', async () => {
    const { app } = await world();

    expect(codeOf(await execute(app, '{ chats { id } }'))).toBe(
      'UNAUTHENTICATED'
    );
  });

  it('logs in by setting the session cookie', async () => {
    const { app } = await world();

    const result = await execute(
      app,
      'mutation { login(email: "ada@example.com", password: "secret") { token user { name } } }'
    );

    expect(result.data?.['login']).toMatchObject({ user: { name: 'Ada' } });
    expect(result.cookie.set).toHaveBeenCalledWith(
      (result.data?.['login'] as { token: string }).token
    );
  });

  it('turns away a bad password without setting a cookie', async () => {
    const { app } = await world();

    const result = await execute(
      app,
      'mutation { login(email: "ada@example.com", password: "guess") { token } }'
    );

    expect(result.errors?.[0]?.message).toBe('Invalid email or password');
    expect(codeOf(result)).toBe('UNAUTHENTICATED');
    expect(result.cookie.set).not.toHaveBeenCalled();
  });

  it('logs out by clearing the session cookie', async () => {
    const { app, ada } = await world();

    const result = await execute(app, 'mutation { logout }', { as: ada });

    expect(result.data).toEqual({ logout: true });
    expect(result.cookie.clear).toHaveBeenCalled();
  });
});

describe('chats', () => {
  it('titles a direct chat after the other person, from each side', async () => {
    const { app, ada, grace, direct } = await world();
    const query = 'query ($id: ID!) { chat(id: $id) { title } }';
    const variables = { id: direct.id };

    expect((await execute(app, query, { as: ada, variables })).data).toEqual({
      chat: { title: 'Grace' },
    });
    expect((await execute(app, query, { as: grace, variables })).data).toEqual({
      chat: { title: 'Ada' },
    });
  });

  it("returns null for a chat the viewer isn't in", async () => {
    const { app, linus, direct } = await world();

    const result = await execute(
      app,
      'query ($id: ID!) { chat(id: $id) { id } }',
      {
        as: linus,
        variables: { id: direct.id },
      }
    );

    expect(result).toMatchObject({ data: { chat: null } });
    expect(result.errors).toBeUndefined();
  });

  it('resolves a whole chat list in one batch per relation', async () => {
    const { app, ada, grace, linus, team, direct } = await world();
    const extra = await app.fixtures.groupChat('Extra', [ada, linus]);
    const services = app.services();
    for (const [chat, sender] of [
      [team, linus],
      [direct, grace],
      [extra, ada],
    ] as const) {
      await services.messages.send(sender, {
        chatId: chat.id,
        content: `in ${chat.id}`,
      });
    }
    const { users, chats, messages } = app.deps.repositories;
    const spies = {
      users: vi.spyOn(users, 'findByIds'),
      chats: vi.spyOn(chats, 'findByIds'),
      pages: vi.spyOn(messages, 'findPages'),
    };

    const result = await execute(
      app,
      `{ chats {
          title
          participants { name }
          messages(limit: 1) { content createdAt sender { name } chat { id } }
      } }`,
      { as: ada }
    );

    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      chats: [
        {
          title: 'Extra',
          participants: [{ name: 'Ada' }, { name: 'Linus' }],
          messages: [
            {
              content: `in ${extra.id}`,
              createdAt: expect.stringMatching(/^\d{4}-\d\d-\d\dT.*Z$/),
              sender: { name: 'Ada' },
              chat: { id: extra.id },
            },
          ],
        },
        expect.objectContaining({ title: 'Grace' }),
        expect.objectContaining({ title: 'Team' }),
      ],
    });
    expect(spies.users).toHaveBeenCalledTimes(2); // the viewer, then everyone else
    expect(spies.pages).toHaveBeenCalledTimes(1);
    expect(spies.chats).toHaveBeenCalledTimes(1);
  });

  it('refuses to open a chat with yourself', async () => {
    const { app, ada } = await world();

    const result = await execute(
      app,
      'mutation ($id: ID!) { findOrCreateChat(participantId: $id) { id } }',
      { as: ada, variables: { id: ada.id } }
    );

    expect(codeOf(result)).toBe('BAD_USER_INPUT');
    expect(result.errors?.[0]?.extensions['field']).toBe('participantId');
  });
});

describe('messages', () => {
  const send = `mutation ($chatId: ID!, $content: String!) {
    sendMessage(input: { chatId: $chatId, content: $content }) { content }
  }`;

  it('rejects blank text as bad input', async () => {
    const { app, ada, team } = await world();

    const result = await execute(app, send, {
      as: ada,
      variables: { chatId: team.id, content: '   ' },
    });

    expect(codeOf(result)).toBe('BAD_USER_INPUT');
    expect(result.errors?.[0]?.extensions['field']).toBe('content');
  });

  it("hides someone else's chat as not found", async () => {
    const { app, linus, direct } = await world();

    const result = await execute(
      app,
      'query ($id: ID!) { messages(chatId: $id) { id } }',
      {
        as: linus,
        variables: { id: direct.id },
      }
    );

    expect(codeOf(result)).toBe('NOT_FOUND');
  });

  it('streams new messages to participants, titled from their side', async () => {
    const { app, ada, grace, linus, direct } = await world();
    const query = 'subscription { messageReceived { content chat { title } } }';
    const toGrace = nextEvent(await feed(app, grace, query));
    const toLinus = nextEvent(await feed(app, linus, query));

    await execute(app, send, {
      as: ada,
      variables: { chatId: direct.id, content: 'hello' },
    });

    expect(await toGrace).toEqual({
      data: { messageReceived: { content: 'hello', chat: { title: 'Ada' } } },
    });
    expect(await toLinus).toBe('nothing');
  });

  it("delivers a brand-new chat with everything the other person's chat list needs", async () => {
    const { app, ada, linus } = await world();
    const toLinus = nextEvent(
      await feed(
        app,
        linus,
        `subscription { messageReceived {
          content chat { id title participants { name } }
        } }`
      )
    );

    const opened = await execute(
      app,
      'mutation ($id: ID!) { findOrCreateChat(participantId: $id) { id } }',
      { as: ada, variables: { id: linus.id } }
    );
    const chatId = (opened.data?.['findOrCreateChat'] as { id: string }).id;
    await execute(app, send, {
      as: ada,
      variables: { chatId, content: 'hi!' },
    });

    expect(await toLinus).toEqual({
      data: {
        messageReceived: {
          content: 'hi!',
          chat: {
            id: chatId,
            title: 'Ada',
            participants: [{ name: 'Ada' }, { name: 'Linus' }],
          },
        },
      },
    });
  });

  it('refuses an anonymous subscription', async () => {
    const { app } = await world();

    const result = await subscribe({
      schema,
      document: parse('subscription { messageReceived { id } }'),
      contextValue: await contextFor(app),
    });

    expect(codeOf(result as ExecutionResult)).toBe('UNAUTHENTICATED');
  });
});
