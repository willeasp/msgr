import { describe, expect, it, vi } from 'vitest';
import { Drawing } from '../domain/drawing.js';
import type { Message } from '../domain/message.js';
import { Page } from '../domain/page.js';
import {
  createTestApp,
  expectOk,
  fakeBrowser,
  nextEvent,
  recordingPushSender,
} from '../testing/harness.js';

async function team() {
  const app = createTestApp();
  const ada = await app.fixtures.user({ name: 'Ada' });
  const grace = await app.fixtures.user({ name: 'Grace' });
  const linus = await app.fixtures.user({ name: 'Linus' });
  const chat = await app.fixtures.groupChat('Team', [ada, grace]);
  return { ...app, ada, grace, linus, chat };
}

describe('sending a message', () => {
  it('stores the trimmed text, stamped by the clock', async () => {
    const sentAt = new Date('2031-05-01T09:30:00.000Z');
    const app = createTestApp({ clock: () => sentAt });
    const ada = await app.fixtures.user({ name: 'Ada' });
    const chat = await app.fixtures.groupChat('Notes', [ada]);

    const message = expectOk(
      await app
        .services()
        .messages.send(ada, { chatId: chat.id, content: '  hi \n' })
    );

    expect(message).toEqual({
      id: message.id,
      kind: 'text',
      chatId: chat.id,
      senderId: ada.id,
      content: 'hi',
      createdAt: sentAt,
    });
  });

  it("pushes it to the other participants' browsers, without waiting for them", async () => {
    const push = recordingPushSender();
    const app = createTestApp({ pushSender: push.sender });
    const ada = await app.fixtures.user({ name: 'Ada' });
    const grace = await app.fixtures.user({ name: 'Grace' });
    const chat = await app.fixtures.groupChat('Team', [ada, grace]);
    await app.deps.repositories.pushSubscriptions.save(
      grace.id,
      fakeBrowser('grace-phone')
    );

    expectOk(
      await app
        .services()
        .messages.send(ada, { chatId: chat.id, content: 'hi' })
    );

    await vi.waitFor(() =>
      expect(push.sent).toEqual([
        {
          endpoint: fakeBrowser('grace-phone').endpoint,
          notification: { title: 'Ada in Team', body: 'hi', chatId: chat.id },
        },
      ])
    );
  });

  it('delivers it live to every participant and nobody else', async () => {
    const { services, ada, grace, linus, chat } = await team();
    const toAda = nextEvent(services().messages.feed(ada));
    const toGrace = nextEvent(services().messages.feed(grace));
    const toLinus = nextEvent(services().messages.feed(linus));

    const message = expectOk(
      await services().messages.send(ada, { chatId: chat.id, content: 'hi' })
    );

    expect(await toAda).toEqual(message);
    expect(await toGrace).toEqual(message);
    expect(await toLinus).toBe('nothing');
  });

  it("moves the chat to the top of its participants' lists", async () => {
    const { fixtures, services, ada, grace, chat } = await team();
    const other = await fixtures.groupChat('Other', [ada, grace]);
    const post = (chatId: string, content: string) =>
      services().messages.send(grace, { chatId, content });
    const order = async () =>
      (await services().chats.listFor(ada)).map(({ id }) => id);

    await post(chat.id, 'first');
    await post(other.id, 'second');
    expect(await order()).toEqual([other.id, chat.id]);

    await post(chat.id, 'third');
    expect(await order()).toEqual([chat.id, other.id]);
  });

  it('rejects blank text before looking at the chat', async () => {
    const { services, ada } = await team();

    expect(
      await services().messages.send(ada, { chatId: 'missing', content: ' ' })
    ).toMatchObject({
      ok: false,
      error: { type: 'InvalidInput', field: 'content' },
    });
  });

  it("refuses to post into someone else's chat", async () => {
    const { services, linus, chat } = await team();

    expect(
      await services().messages.send(linus, { chatId: chat.id, content: 'hi' })
    ).toEqual({ ok: false, error: { type: 'NotFound', entity: 'Chat' } });
  });
});

const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const drawing = (() => {
  const bytes = new Uint8Array(Drawing.BYTES);
  bytes[42] = 0b0011_1100;
  return encode(bytes);
})();

describe('sending a drawing', () => {
  it('stores it, stamped by the clock, and delivers it live', async () => {
    const { services, ada, grace, linus, chat } = await team();
    const toGrace = nextEvent(services().messages.feed(grace));
    const toLinus = nextEvent(services().messages.feed(linus));

    const message = expectOk(
      await services().messages.sendDrawing(ada, { chatId: chat.id, drawing })
    );

    expect(message).toEqual({
      id: message.id,
      kind: 'drawing',
      chatId: chat.id,
      senderId: ada.id,
      drawing,
      createdAt: expect.any(Date),
    });
    expect(await toGrace).toEqual(message);
    expect(await toLinus).toBe('nothing');
  });

  it('rejects a bad drawing before looking at the chat, storing nothing', async () => {
    const { services, ada, chat } = await team();
    const blank = encode(new Uint8Array(Drawing.BYTES));

    expect(
      await services().messages.sendDrawing(ada, {
        chatId: 'missing',
        drawing: blank,
      })
    ).toMatchObject({
      ok: false,
      error: { type: 'InvalidInput', field: 'drawing' },
    });
    expect(
      expectOk(await services().messages.list(ada, { chatId: chat.id }))
    ).toEqual([]);
  });

  it("refuses to post into someone else's chat", async () => {
    const { services, linus, chat } = await team();

    expect(
      await services().messages.sendDrawing(linus, {
        chatId: chat.id,
        drawing,
      })
    ).toEqual({ ok: false, error: { type: 'NotFound', entity: 'Chat' } });
  });
});

describe('reading messages', () => {
  it('pages back from the newest message, each page oldest first', async () => {
    const { services, ada, grace, chat } = await team();
    const sent: Message[] = [];
    for (const [sender, content] of [
      [ada, 'one'],
      [grace, 'two'],
      [ada, 'three'],
    ] as const) {
      sent.push(
        expectOk(
          await services().messages.send(sender, { chatId: chat.id, content })
        )
      );
    }
    const read = async (limit?: number, offset?: number) =>
      expectOk(
        await services().messages.list(grace, {
          chatId: chat.id,
          limit,
          offset,
        })
      );

    expect(await read()).toEqual(sent);
    expect(await read(2)).toEqual(sent.slice(1));
    expect(await read(2, 2)).toEqual(sent.slice(0, 1));
  });

  it("refuses to read someone else's chat", async () => {
    const { services, linus, chat } = await team();

    expect(await services().messages.list(linus, { chatId: chat.id })).toEqual({
      ok: false,
      error: { type: 'NotFound', entity: 'Chat' },
    });
  });

  it('rejects a page outside the bounds', async () => {
    const { services, ada, chat } = await team();

    expect(
      await services().messages.list(ada, {
        chatId: chat.id,
        limit: Page.MAX_LIMIT + 1,
      })
    ).toMatchObject({
      ok: false,
      error: { type: 'InvalidInput', field: 'limit' },
    });
  });
});
