import { graphql, parse, subscribe, type ExecutionResult } from 'graphql';
import { describe, expect, it, vi } from 'vitest';
import type { Dependencies } from '../application/ports.js';
import type { Url } from '../domain/link.js';
import type { User } from '../domain/user.js';
import {
  createTestApp,
  fakeBrowser,
  fakeHash,
  fakeLinkPreviewer,
  nextEvent,
  TEST_PUSH_KEY,
} from '../testing/harness.js';
import { createContext } from './context.js';
import { toBase64 } from '@msgr/bitmap';
import { exampleMovie, movieInput } from '../testing/movies.js';
import { soundInput } from '../testing/sounds.js';
import { examplePicture, pictureInput } from '../testing/pictures.js';
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

async function world(overrides: Partial<Dependencies> = {}) {
  const app = createTestApp(overrides);
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

describe('invites', () => {
  const SIGN_UP = `
    mutation ($code: String!) {
      signUp(input: {
        inviteCode: $code
        name: "Margaret"
        email: "margaret@example.com"
        password: "apollo-guidance"
      }) { token user { name } chat { title } }
    }
  `;

  it('lets a member invite someone, who signs up into a session cookie', async () => {
    const { app, ada } = await world();

    const invite = await execute(
      app,
      'mutation { createInvite { code expiresAt } }',
      { as: ada }
    );
    const code = (invite.data?.['createInvite'] as { code: string }).code;
    const signUp = await execute(app, SIGN_UP, { variables: { code } });

    expect(invite.data?.['createInvite']).toEqual({
      code,
      expiresAt: expect.any(String),
    });
    expect(signUp.data?.['signUp']).toMatchObject({
      user: { name: 'Margaret' },
      chat: { title: 'Ada' },
    });
    expect(signUp.cookie.set).toHaveBeenCalledWith(
      (signUp.data?.['signUp'] as { token: string }).token
    );
  });

  it('tells the inviter, live, who joined', async () => {
    const { app, ada } = await world();
    const { code } = await app.services().invites.create(ada);
    const toAda = nextEvent(
      await feed(
        app,
        ada,
        'subscription { chatAdded { reason by { name } chat { title } } }'
      )
    );

    await execute(app, SIGN_UP, { variables: { code } });

    expect(await toAda).toEqual({
      data: {
        chatAdded: {
          reason: 'INVITE_ACCEPTED',
          by: { name: 'Margaret' },
          chat: { title: 'Margaret' },
        },
      },
    });
  });

  it('keeps inviting behind sign-in', async () => {
    const { app } = await world();

    expect(
      codeOf(await execute(app, 'mutation { createInvite { code } }'))
    ).toBe('UNAUTHENTICATED');
  });

  it('reports a spent invite as not found, without a cookie', async () => {
    const { app, ada } = await world();
    const { code } = await app.services().invites.create(ada);
    await execute(app, SIGN_UP, { variables: { code } });

    const again = await execute(app, SIGN_UP, { variables: { code } });

    expect(codeOf(again)).toBe('NOT_FOUND');
    expect(again.cookie.set).not.toHaveBeenCalled();
  });

  it('tells anyone, before they fill in the form, whether an invite is spent', async () => {
    const { app, ada } = await world();
    const { code } = await app.services().invites.create(ada);
    const ask = () =>
      execute(app, 'query ($code: String!) { inviteRedeemable(code: $code) }', {
        variables: { code },
      });

    expect((await ask()).data).toEqual({ inviteRedeemable: true });
    await execute(app, SIGN_UP, { variables: { code } });
    expect((await ask()).data).toEqual({ inviteRedeemable: false });
  });
});

describe('channels', () => {
  it('joins by name, titled with a #, and leaves again', async () => {
    const { app, ada } = await world();

    const joined = await execute(
      app,
      'mutation { joinChannel(name: "Book Club") { id kind title } }',
      { as: ada }
    );
    const chat = joined.data?.['joinChannel'] as { id: string };
    const left = await execute(
      app,
      'mutation ($id: ID!) { leaveChannel(chatId: $id) }',
      { as: ada, variables: { id: chat.id } }
    );

    expect(joined.data?.['joinChannel']).toEqual({
      id: chat.id,
      kind: 'CHANNEL',
      title: '#book-club',
    });
    expect(left.data).toEqual({ leaveChannel: true });
  });

  it('adds people to a channel, and tells them who did', async () => {
    const { app, ada, grace } = await world();
    const books = await app.services().chats.joinChannel(ada, 'books');
    if (!books.ok) throw new Error('setup');
    const toGrace = nextEvent(
      await feed(
        app,
        grace,
        'subscription { chatAdded { reason by { name } chat { title } } }'
      )
    );

    const added = await execute(
      app,
      'mutation ($id: ID!, $people: [ID!]!) { addToChannel(chatId: $id, userIds: $people) { participants { name } } }',
      { as: ada, variables: { id: books.value.id, people: [grace.id] } }
    );

    expect(added.data).toEqual({
      addToChannel: { participants: [{ name: 'Ada' }, { name: 'Grace' }] },
    });
    expect(await toGrace).toEqual({
      data: {
        chatAdded: {
          reason: 'ADDED_TO_CHANNEL',
          by: { name: 'Ada' },
          chat: { title: '#books' },
        },
      },
    });
  });

  it("lists every channel without letting anyone read the ones they haven't joined", async () => {
    const { app, ada, grace } = await world();
    await app.services().chats.joinChannel(grace, 'general');
    await app.services().chats.joinChannel(grace, 'books');
    await app.services().chats.joinChannel(ada, 'books');

    const result = await execute(
      app,
      '{ channels { name participantCount joined } }',
      { as: ada }
    );

    expect(result.data).toEqual({
      channels: [
        { name: 'books', participantCount: 2, joined: true },
        { name: 'general', participantCount: 1, joined: false },
      ],
    });
  });

  it('says what kind each chat is', async () => {
    const { app, ada } = await world();

    const result = await execute(app, '{ chats { kind } }', { as: ada });

    expect(result.data).toEqual({
      chats: expect.arrayContaining([{ kind: 'DIRECT' }, { kind: 'GROUP' }]),
    });
  });
});

describe('profiles', () => {
  const update = `mutation ($name: String!, $avatar: PictureInput) {
    updateProfile(input: { name: $name, avatar: $avatar }) {
      name
      avatar { width height bits }
    }
  }`;

  it("changes the viewer's name and picture, and takes the picture away", async () => {
    const { app, ada } = await world();
    const avatar = pictureInput(64, 64);

    const saved = await execute(app, update, {
      as: ada,
      variables: { name: 'Countess', avatar },
    });

    expect(saved.data).toEqual({
      updateProfile: {
        name: 'Countess',
        avatar: { width: 64, height: 64, bits: expect.any(String) },
      },
    });
    const removed = await execute(app, update, {
      as: ada,
      variables: { name: 'Countess', avatar: null },
    });
    expect(removed.data).toEqual({
      updateProfile: { name: 'Countess', avatar: null },
    });
  });

  it('rejects a picture of the wrong size as bad input, and anyone signed out', async () => {
    const { app, ada } = await world();
    const variables = { name: 'Ada', avatar: pictureInput(32, 32) };

    const result = await execute(app, update, { as: ada, variables });

    expect(codeOf(result)).toBe('BAD_USER_INPUT');
    expect(result.errors?.[0]?.extensions['field']).toBe('avatar');
    expect(codeOf(await execute(app, update, { variables }))).toBe(
      'UNAUTHENTICATED'
    );
  });

  it('streams the change to everyone who shares a chat', async () => {
    const { app, ada, grace } = await world();
    const toGrace = nextEvent(
      await feed(app, grace, 'subscription { profileChanged { id name } }')
    );

    await execute(app, update, {
      as: ada,
      variables: { name: 'Countess', avatar: null },
    });

    expect(await toGrace).toEqual({
      data: { profileChanged: { id: ada.id, name: 'Countess' } },
    });
  });
});

describe('throttling', () => {
  it('reports a throttled login as too many requests', async () => {
    const app = createTestApp({ throttle: { attempt: () => false } });

    const result = await execute(
      app,
      'mutation { login(email: "ada@example.com", password: "secret") { token } }'
    );

    expect(codeOf(result)).toBe('TOO_MANY_REQUESTS');
    expect(result.errors?.[0]?.message).toBe(
      'Too many attempts. Wait a few minutes and try again.'
    );
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

  it('names the other person in a direct chat, and nobody in a group', async () => {
    const { app, ada, grace, team, direct } = await world();
    const query = 'query ($id: ID!) { chat(id: $id) { counterpart { name } } }';

    expect(
      (await execute(app, query, { as: ada, variables: { id: direct.id } }))
        .data
    ).toEqual({ chat: { counterpart: { name: 'Grace' } } });
    expect(
      (await execute(app, query, { as: grace, variables: { id: direct.id } }))
        .data
    ).toEqual({ chat: { counterpart: { name: 'Ada' } } });
    expect(
      (await execute(app, query, { as: ada, variables: { id: team.id } })).data
    ).toEqual({ chat: { counterpart: null } });
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

  const sendPicture = `mutation ($chatId: ID!, $content: String, $picture: PictureInput) {
    sendMessage(input: { chatId: $chatId, content: $content, picture: $picture }) {
      content
      picture { width height bits }
    }
  }`;

  it('sends a picture, alone or with text, and reads it back', async () => {
    const { app, ada, team } = await world();
    const picture = pictureInput(13, 7);
    const kept = {
      width: 13,
      height: 7,
      bits: toBase64(examplePicture(13, 7).deflated),
    };

    const alone = await execute(app, sendPicture, {
      as: ada,
      variables: { chatId: team.id, picture },
    });
    const captioned = await execute(app, sendPicture, {
      as: ada,
      variables: { chatId: team.id, content: 'look', picture },
    });
    const read = await execute(
      app,
      'query ($id: ID!) { messages(chatId: $id) { content picture { width height bits } } }',
      { as: ada, variables: { id: team.id } }
    );

    expect(alone.data).toEqual({
      sendMessage: { content: null, picture: kept },
    });
    expect(captioned.data).toEqual({
      sendMessage: { content: 'look', picture: kept },
    });
    expect(read.data).toEqual({
      messages: [
        { content: null, picture: kept },
        { content: 'look', picture: kept },
      ],
    });
  });

  it('rejects a bad picture, or a message with nothing in it, as bad input', async () => {
    const { app, ada, team } = await world();

    for (const [variables, field] of [
      [{ picture: { ...pictureInput(), width: 0 } }, 'picture'],
      [{ picture: pictureInput(8, 1, 5) }, 'picture'],
      [{}, 'content'],
    ] as const) {
      const result = await execute(app, sendPicture, {
        as: ada,
        variables: { chatId: team.id, ...variables },
      });
      expect(codeOf(result)).toBe('BAD_USER_INPUT');
      expect(result.errors?.[0]?.extensions['field']).toBe(field);
    }
  });

  const sendMovie = `mutation ($chatId: ID!, $content: String, $picture: PictureInput, $movie: MovieInput) {
    sendMessage(input: { chatId: $chatId, content: $content, picture: $picture, movie: $movie }) {
      content
      picture { width }
      movie { width height frames bits }
    }
  }`;

  it('sends a movie, alone or with text, and reads it back', async () => {
    const { app, ada, team } = await world();
    const movie = movieInput(13, 7, 5);
    const kept = {
      width: 13,
      height: 7,
      frames: 5,
      bits: toBase64(exampleMovie(13, 7, 5).coded),
    };

    const alone = await execute(app, sendMovie, {
      as: ada,
      variables: { chatId: team.id, movie },
    });
    const captioned = await execute(app, sendMovie, {
      as: ada,
      variables: { chatId: team.id, content: 'look', movie },
    });
    const read = await execute(
      app,
      'query ($id: ID!) { messages(chatId: $id) { content picture { width } movie { width height frames bits } } }',
      { as: ada, variables: { id: team.id } }
    );

    expect(alone.data).toEqual({
      sendMessage: { content: null, picture: null, movie: kept },
    });
    expect(captioned.data).toEqual({
      sendMessage: { content: 'look', picture: null, movie: kept },
    });
    expect(read.data).toEqual({
      messages: [
        { content: null, picture: null, movie: kept },
        { content: 'look', picture: null, movie: kept },
      ],
    });
  });

  it('rejects a bad movie, or a movie with a picture, as bad input', async () => {
    const { app, ada, team } = await world();

    for (const variables of [
      { movie: { ...movieInput(), frames: 0 } },
      { movie: movieInput(8, 1, 2, 8) },
      { picture: pictureInput(), movie: movieInput() },
    ]) {
      const result = await execute(app, sendMovie, {
        as: ada,
        variables: { chatId: team.id, ...variables },
      });
      expect(codeOf(result)).toBe('BAD_USER_INPUT');
      expect(result.errors?.[0]?.extensions['field']).toBe('movie');
    }
  });

  const sendSound = `mutation ($chatId: ID!, $content: String, $movie: MovieInput, $sound: SoundInput) {
    sendMessage(input: { chatId: $chatId, content: $content, movie: $movie, sound: $sound }) {
      content
      movie { frames }
      sound { frames bits }
    }
  }`;

  it('sends a sound, alone or with text, and reads it back', async () => {
    const { app, ada, team } = await world();
    const sound = soundInput(2);
    const kept = { frames: sound.frames, bits: sound.bits };

    const alone = await execute(app, sendSound, {
      as: ada,
      variables: { chatId: team.id, sound },
    });
    const captioned = await execute(app, sendSound, {
      as: ada,
      variables: { chatId: team.id, content: 'listen', sound },
    });
    const read = await execute(
      app,
      'query ($id: ID!) { messages(chatId: $id) { content movie { frames } sound { frames bits } } }',
      { as: ada, variables: { id: team.id } }
    );

    expect(alone.data).toEqual({
      sendMessage: { content: null, movie: null, sound: kept },
    });
    expect(captioned.data).toEqual({
      sendMessage: { content: 'listen', movie: null, sound: kept },
    });
    expect(read.data).toEqual({
      messages: [
        { content: null, movie: null, sound: kept },
        { content: 'listen', movie: null, sound: kept },
      ],
    });
  });

  it('rejects a bad sound, or a sound with a movie, as bad input', async () => {
    const { app, ada, team } = await world();

    for (const variables of [
      { sound: { ...soundInput(), frames: 1 } },
      { sound: soundInput(1, 0) },
      { movie: movieInput(), sound: soundInput() },
    ]) {
      const result = await execute(app, sendSound, {
        as: ada,
        variables: { chatId: team.id, ...variables },
      });
      expect(codeOf(result)).toBe('BAD_USER_INPUT');
      expect(result.errors?.[0]?.extensions['field']).toBe('sound');
    }
  });

  it('previews the first link in a message', async () => {
    const { app, ada, team } = await world({
      linkPreviewer: fakeLinkPreviewer([
        {
          url: 'https://example.com/page' as Url,
          site: 'Example',
          title: 'An example page',
          description: null,
          thumbnail: null,
        },
      ]),
    });
    const sent = await execute(
      app,
      `mutation ($chatId: ID!) {
        sendMessage(input: { chatId: $chatId, content: "see https://example.com/page" }) { id }
      }`,
      { as: ada, variables: { chatId: team.id } }
    );
    const id = (sent.data as { sendMessage: { id: string } }).sendMessage.id;

    const result = await execute(
      app,
      'query ($id: ID!) { linkPreview(messageId: $id) { url site title description thumbnail } }',
      { as: ada, variables: { id } }
    );

    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      linkPreview: {
        url: 'https://example.com/page',
        site: 'Example',
        title: 'An example page',
        description: null,
        thumbnail: null,
      },
    });
  });

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

describe('push', () => {
  const browser = { ...fakeBrowser('ada-phone') };
  const ENABLE = `mutation ($subscription: PushSubscriptionInput!) {
    enablePush(subscription: $subscription)
  }`;
  const DISABLE = `mutation ($endpoint: String!) {
    disablePush(endpoint: $endpoint)
  }`;

  it('hands out the key browsers subscribe with, signed in or not', async () => {
    const { app } = await world();
    expect((await execute(app, '{ pushKey }')).data).toEqual({
      pushKey: TEST_PUSH_KEY,
    });
  });

  it("remembers and forgets the viewer's browser", async () => {
    const { app, ada } = await world();
    const browsers = () =>
      app.deps.repositories.pushSubscriptions.findByUserIds([ada.id]);

    const enabled = await execute(app, ENABLE, {
      as: ada,
      variables: { subscription: browser },
    });
    expect(enabled.data).toEqual({ enablePush: true });
    expect(await browsers()).toEqual([
      { userId: ada.id, subscription: browser },
    ]);

    const disabled = await execute(app, DISABLE, {
      as: ada,
      variables: { endpoint: browser.endpoint },
    });
    expect(disabled.data).toEqual({ disablePush: true });
    expect(await browsers()).toEqual([]);
  });

  it('refuses anonymous callers and addresses that are not push services', async () => {
    const { app, ada } = await world();

    expect(
      codeOf(
        await execute(app, ENABLE, { variables: { subscription: browser } })
      )
    ).toBe('UNAUTHENTICATED');
    expect(
      codeOf(
        await execute(app, ENABLE, {
          as: ada,
          variables: {
            subscription: { ...browser, endpoint: 'https://127.0.0.1/' },
          },
        })
      )
    ).toBe('BAD_USER_INPUT');
  });

  it('counts the viewer as watching a chat while the subscription is open', async () => {
    const { app, ada, team } = await world();
    const stream = await feed(
      app,
      ada,
      `subscription { watching(chatId: "${team.id}") }`
    );

    const reading = stream.next();
    await vi.waitFor(() =>
      expect(app.deps.watching.isWatching(ada.id, team.id)).toBe(true)
    );

    await stream.return?.();
    await reading;
    expect(app.deps.watching.isWatching(ada.id, team.id)).toBe(false);
  });
});
