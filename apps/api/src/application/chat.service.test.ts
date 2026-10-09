import { describe, expect, it } from 'vitest';
import { createTestApp, expectOk } from '../testing/harness.js';

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
