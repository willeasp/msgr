import { describe, expect, it, vi } from 'vitest';
import type { Chat } from '../domain/chat.js';
import {
  MessageId,
  type Message,
  type MessageContent,
} from '../domain/message.js';
import type { User } from '../domain/user.js';
import {
  createTestApp,
  fakeBrowser as browser,
  recordingPushSender,
} from '../testing/harness.js';
import { createNotifier } from './notifier.js';
import type { Dependencies } from './ports.js';

async function team(overrides: Partial<Dependencies> = {}) {
  const push = recordingPushSender([browser('grace-old-phone').endpoint]);
  const app = createTestApp({ pushSender: push.sender, ...overrides });
  const ada = await app.fixtures.user({ name: 'Ada' });
  const grace = await app.fixtures.user({ name: 'Grace' });
  const linus = await app.fixtures.user({ name: 'Linus' });
  const chat = await app.fixtures.groupChat('Team', [ada, grace, linus]);
  const subscriptions = app.deps.repositories.pushSubscriptions;
  await subscriptions.save(ada.id, browser('ada-phone'));
  await subscriptions.save(grace.id, browser('grace-phone'));
  await subscriptions.save(grace.id, browser('grace-laptop'));
  await subscriptions.save(linus.id, browser('linus-phone'));
  const message = (sender: User, content: string, to: Chat = chat) =>
    ({
      id: MessageId('m'),
      chatId: to.id,
      senderId: sender.id,
      content: content as MessageContent,
      picture: null,
      movie: null,
      sound: null,
      createdAt: new Date(0),
    } satisfies Message);
  const notifier = createNotifier(app.deps);
  return { ...app, push, ada, grace, linus, chat, message, notifier };
}

/** The last part of each endpoint, sorted: "grace-phone". */
const names = (sent: readonly { readonly endpoint: string }[]) =>
  sent.map(({ endpoint }) => endpoint.split('/').pop()).sort();

describe('notifying about a message', () => {
  it("pushes it to every participant's browsers but the sender's", async () => {
    const { push, notifier, ada, chat, message } = await team();

    await notifier.message(message(ada, 'hi'), chat, ada);

    expect(names(push.sent)).toEqual([
      'grace-laptop',
      'grace-phone',
      'linus-phone',
    ]);
    expect(push.sent[0]?.notification).toEqual({
      title: 'Ada in Team',
      body: 'hi',
      chatId: chat.id,
    });
  });

  it("tells each browser how many messages its person has yet to read, for the app's badge", async () => {
    const { deps, push, notifier, ada, linus, chat } = await team();
    const keep = (sender: User, content: string, at: string) =>
      deps.repositories.messages.append({
        chatId: chat.id,
        senderId: sender.id,
        content: content as MessageContent,
        picture: null,
        movie: null,
        sound: null,
        createdAt: new Date(at),
      });
    await keep(linus, 'one', '2030-01-01T00:01:00Z');
    const two = await keep(ada, 'two', '2030-01-01T00:02:00Z');

    await notifier.message(two, chat, ada);

    expect(
      Object.fromEntries(
        push.sent.map(({ endpoint, unread }) => [
          endpoint.split('/').pop(),
          unread,
        ])
      )
    ).toEqual({ 'grace-laptop': 2, 'grace-phone': 2, 'linus-phone': 1 });
  });

  it('skips people watching that chat, but not people watching another', async () => {
    const { deps, fixtures, push, notifier, ada, grace, linus, chat, message } =
      await team();
    const other = await fixtures.groupChat('Other', [ada, linus]);
    deps.watching.watch(grace.id, chat.id);
    deps.watching.watch(linus.id, other.id);

    await notifier.message(message(ada, 'hi'), chat, ada);

    expect(names(push.sent)).toEqual(['linus-phone']);
  });

  it('forgets browsers the push service says are gone', async () => {
    const { deps, push, notifier, ada, grace, chat, message } = await team();
    await deps.repositories.pushSubscriptions.save(
      grace.id,
      browser('grace-old-phone')
    );

    await notifier.message(message(ada, 'hi'), chat, ada);

    expect(names(push.sent)).toContain('grace-old-phone');
    const left = await deps.repositories.pushSubscriptions.findByUserIds([
      grace.id,
    ]);
    expect(names(left.map(({ subscription }) => subscription))).toEqual([
      'grace-laptop',
      'grace-phone',
    ]);
  });

  it('never fails because a push did', async () => {
    const quiet = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const { notifier, ada, chat, message } = await team({
      pushSender: {
        send: async () => {
          throw new Error('push service down');
        },
      },
    });

    await expect(
      notifier.message(message(ada, 'hi'), chat, ada)
    ).resolves.toBeUndefined();
    expect(quiet).toHaveBeenCalled();
    quiet.mockRestore();
  });

  it('still notifies when the unread count fails, leaving the badge be', async () => {
    const quiet = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const { deps, push, notifier, ada, chat, message } = await team();
    vi.spyOn(deps.repositories.reads, 'countAllUnread').mockRejectedValue(
      new Error('database asleep')
    );

    await notifier.message(message(ada, 'hi'), chat, ada);

    expect(names(push.sent)).toEqual([
      'grace-laptop',
      'grace-phone',
      'linus-phone',
    ]);
    expect(push.sent.map(({ unread }) => unread)).toEqual([null, null, null]);
    quiet.mockRestore();
  });

  it('never fails when it cannot even look anyone up', async () => {
    const quiet = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const { deps, notifier, ada, chat, message } = await team();
    vi.spyOn(
      deps.repositories.pushSubscriptions,
      'findByUserIds'
    ).mockRejectedValue(new Error('database down'));

    await expect(
      notifier.message(message(ada, 'hi'), chat, ada)
    ).resolves.toBeUndefined();
    quiet.mockRestore();
  });
});

describe('notifying about a chat that now includes someone', () => {
  it("pushes it to that person's browsers only", async () => {
    const { push, notifier, ada, grace, chat } = await team();

    await notifier.chatAdded(
      { chat, by: ada.id, reason: 'added-to-channel' },
      ada,
      grace.id
    );

    expect(names(push.sent)).toEqual(['grace-laptop', 'grace-phone']);
    expect(push.sent[0]?.notification.title).toBe('Ada added you to Team');
  });
});
