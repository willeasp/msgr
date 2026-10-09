import { describe, expect, it } from 'vitest';
import { createTestApp, expectOk, nextEvent } from '../testing/harness.js';

async function threePeople() {
  const app = createTestApp();
  const ada = await app.fixtures.user({ name: 'Ada' });
  const grace = await app.fixtures.user({ name: 'Grace' });
  const linus = await app.fixtures.user({ name: 'Linus' });
  return { ...app, ada, grace, linus };
}

describe('finding a chat', () => {
  it("finds a chat the viewer is in and hides everyone else's", async () => {
    const { fixtures, services, ada, grace, linus } = await threePeople();
    const chat = await fixtures.groupChat('Team', [ada, grace]);

    expect(await services().chats.find(grace, chat.id)).toEqual({
      ok: true,
      value: chat,
    });
    expect(await services().chats.find(linus, chat.id)).toEqual({
      ok: false,
      error: { type: 'NotFound', entity: 'Chat' },
    });
    expect(await services().chats.find(ada, 'missing')).toEqual({
      ok: false,
      error: { type: 'NotFound', entity: 'Chat' },
    });
  });

  it("lists only the viewer's chats", async () => {
    const { fixtures, services, ada, grace, linus } = await threePeople();
    const team = await fixtures.groupChat('Team', [ada, grace]);
    await fixtures.groupChat('Elsewhere', [grace, linus]);

    expect(await services().chats.listFor(ada)).toEqual([team]);
  });
});

describe('opening a direct chat', () => {
  it('creates the chat once, then returns it to either side', async () => {
    const { services, ada, grace } = await threePeople();

    const opened = expectOk(await services().chats.openDirect(ada, grace.id));
    const reopened = expectOk(await services().chats.openDirect(grace, ada.id));

    expect(reopened).toEqual(opened);
    expect(opened).toMatchObject({
      kind: 'direct',
      participantIds: [ada.id, grace.id].sort(),
    });
  });

  it('is not confused by a group of the same two people', async () => {
    const { fixtures, services, ada, grace } = await threePeople();
    const group = await fixtures.groupChat('Pair', [ada, grace]);

    const direct = expectOk(await services().chats.openDirect(ada, grace.id));

    expect(direct.id).not.toBe(group.id);
  });

  it('refuses a chat with yourself', async () => {
    const { services, ada } = await threePeople();

    expect(await services().chats.openDirect(ada, ada.id)).toMatchObject({
      ok: false,
      error: { type: 'InvalidInput', field: 'participantId' },
    });
  });

  it('refuses an unknown user', async () => {
    const { services, ada } = await threePeople();

    expect(await services().chats.openDirect(ada, 'nobody')).toEqual({
      ok: false,
      error: { type: 'NotFound', entity: 'User' },
    });
  });
});

describe('channels', () => {
  it('joins a channel by name, creating it the first time', async () => {
    const { services, ada, grace } = await threePeople();

    const created = expectOk(
      await services().chats.joinChannel(ada, '#General')
    );
    const joined = expectOk(
      await services().chats.joinChannel(grace, 'general')
    );

    expect(created).toMatchObject({ kind: 'channel', name: 'general' });
    expect(joined).toEqual({
      ...created,
      participantIds: [ada.id, grace.id].sort(),
    });
  });

  it('refuses a name that cannot be a channel', async () => {
    const { services, ada } = await threePeople();

    expect(await services().chats.joinChannel(ada, 'no/slashes')).toMatchObject(
      { ok: false, error: { type: 'InvalidInput', field: 'name' } }
    );
  });

  it('lists every channel, including ones the viewer has not joined', async () => {
    const { services, ada, grace } = await threePeople();
    const books = expectOk(await services().chats.joinChannel(ada, 'books'));
    const random = expectOk(
      await services().chats.joinChannel(grace, 'random')
    );

    expect(await services().chats.listChannels()).toEqual([books, random]);
  });

  it('delivers channel messages live to someone who just joined', async () => {
    const { services, ada, grace } = await threePeople();
    const general = expectOk(
      await services().chats.joinChannel(ada, 'general')
    );
    expectOk(await services().chats.joinChannel(grace, 'general'));
    const feed = services().messages.feed(grace);
    const next = nextEvent(feed);

    await services().messages.send(ada, {
      chatId: general.id,
      content: 'welcome!',
    });

    expect(await next).toMatchObject({ content: 'welcome!' });
  });

  it('lets a member leave, after which the channel is hidden from them', async () => {
    const { services, ada, grace } = await threePeople();
    const general = expectOk(
      await services().chats.joinChannel(ada, 'general')
    );
    expectOk(await services().chats.joinChannel(grace, 'general'));

    expect(await services().chats.leaveChannel(grace, general.id)).toEqual({
      ok: true,
      value: true,
    });
    expect(await services().chats.find(grace, general.id)).toEqual({
      ok: false,
      error: { type: 'NotFound', entity: 'Chat' },
    });
  });

  it('leaves only channels, and only ones the viewer can see', async () => {
    const { fixtures, services, ada, grace, linus } = await threePeople();
    const group = await fixtures.groupChat('Team', [ada, grace]);
    const general = expectOk(
      await services().chats.joinChannel(ada, 'general')
    );

    expect(await services().chats.leaveChannel(ada, group.id)).toMatchObject({
      ok: false,
      error: { type: 'InvalidInput', field: 'chatId' },
    });
    expect(await services().chats.leaveChannel(linus, general.id)).toEqual({
      ok: false,
      error: { type: 'NotFound', entity: 'Chat' },
    });
  });
});

describe('adding people to a channel', () => {
  it('puts them in and tells each one who added them', async () => {
    const { services, ada, grace, linus } = await threePeople();
    const books = expectOk(await services().chats.joinChannel(ada, 'books'));
    const graceHears = nextEvent(services().chats.additions(grace));

    const added = expectOk(
      await services().chats.addToChannel(ada, books.id, [grace.id, linus.id])
    );

    expect(added.participantIds).toEqual([ada.id, grace.id, linus.id].sort());
    expect(await graceHears).toEqual({
      chat: added,
      by: ada.id,
      reason: 'added-to-channel',
    });
  });

  it('says nothing to someone who was already there', async () => {
    const { services, ada, grace } = await threePeople();
    const books = expectOk(await services().chats.joinChannel(ada, 'books'));
    expectOk(await services().chats.joinChannel(grace, 'books'));
    const graceHears = nextEvent(services().chats.additions(grace));

    expectOk(await services().chats.addToChannel(ada, books.id, [grace.id]));

    expect(await graceHears).toBe('nothing');
  });

  it('lets only members add people, and only to channels', async () => {
    const { fixtures, services, ada, grace, linus } = await threePeople();
    const books = expectOk(await services().chats.joinChannel(ada, 'books'));
    const group = await fixtures.groupChat('Team', [ada, grace]);

    expect(
      await services().chats.addToChannel(linus, books.id, [linus.id])
    ).toEqual({ ok: false, error: { type: 'NotFound', entity: 'Chat' } });
    expect(
      await services().chats.addToChannel(ada, group.id, [linus.id])
    ).toMatchObject({
      ok: false,
      error: { type: 'InvalidInput', field: 'chatId' },
    });
  });

  it('refuses someone who does not exist, adding nobody', async () => {
    const { services, ada, grace } = await threePeople();
    const books = expectOk(await services().chats.joinChannel(ada, 'books'));

    expect(
      await services().chats.addToChannel(ada, books.id, [grace.id, 'nobody'])
    ).toEqual({ ok: false, error: { type: 'NotFound', entity: 'User' } });
    expect(await services().chats.find(grace, books.id)).toMatchObject({
      ok: false,
    });
  });
});
