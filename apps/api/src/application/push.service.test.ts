import { describe, expect, it } from 'vitest';
import { ChatId } from '../domain/chat.js';
import type { User } from '../domain/user.js';
import {
  createTestApp,
  expectOk,
  fakeBrowser,
  TEST_PUSH_KEY,
} from '../testing/harness.js';

const browser = fakeBrowser('phone');

async function twoPeople() {
  const app = createTestApp();
  const ada = await app.fixtures.user({ name: 'Ada' });
  const grace = await app.fixtures.user({ name: 'Grace' });
  /** Whom each of these people's browsers notify. */
  const notified = async (...people: User[]) =>
    (
      await app.deps.repositories.pushSubscriptions.findByUserIds(
        people.map(({ id }) => id)
      )
    ).map(({ userId }) => userId);
  return { ...app, ada, grace, push: app.services().push, notified };
}

describe('push', () => {
  it('hands out the key browsers subscribe with', async () => {
    const { push } = await twoPeople();
    expect(push.key()).toBe(TEST_PUSH_KEY);
  });

  it('remembers a browser for the viewer, moving it from whoever had it', async () => {
    const { push, ada, grace, notified } = await twoPeople();

    expectOk(await push.enable(ada, browser));
    expectOk(await push.enable(grace, browser));

    expect(await notified(ada, grace)).toEqual([grace.id]);
  });

  it('refuses a browser that is not on a push service, storing nothing', async () => {
    const { push, ada, notified } = await twoPeople();

    expect(
      await push.enable(ada, {
        ...browser,
        endpoint: 'https://169.254.169.254/',
      })
    ).toMatchObject({
      ok: false,
      error: { type: 'InvalidInput', field: 'endpoint' },
    });
    expect(await notified(ada)).toEqual([]);
  });

  it("forgets only the viewer's own browser", async () => {
    const { push, ada, grace, notified } = await twoPeople();
    expectOk(await push.enable(grace, browser));

    expect(await push.disable(ada, browser.endpoint)).toBe(true);
    expect(await notified(grace)).toEqual([grace.id]);

    await push.disable(grace, browser.endpoint);
    expect(await notified(grace)).toEqual([]);
  });

  it('watches a chat from the first read until the subscription ends', async () => {
    const { deps, push, ada } = await twoPeople();
    const team = ChatId('team');
    const watch = push.watch(ada, team);

    const reading = watch.next();
    expect(deps.watching.isWatching(ada.id, team)).toBe(true);

    await watch.return?.();
    expect(await reading).toEqual({ done: true, value: undefined });
    expect(deps.watching.isWatching(ada.id, team)).toBe(false);
  });

  it('never starts watching once ended, even if ended before the first read', async () => {
    const { deps, push, ada } = await twoPeople();
    const team = ChatId('team');
    const watch = push.watch(ada, team);

    await watch.return?.();
    await watch.next();

    expect(deps.watching.isWatching(ada.id, team)).toBe(false);
  });
});
