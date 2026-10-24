import { expect, test } from '@playwright/test';
import { countRenders, rendersDuring, type Renders } from './renders';
import {
  anotherPerson,
  chatWindow,
  graphql,
  joinChannel,
  signIn,
} from './support';

/*
 * What happens re-renders only what shows it (CLAUDE.md, "Render what
 * changed"): measured in the production build, through the hook React
 * DevTools uses (renders.ts).
 */

const LOG = '[role="log"]';

/** How many message bubbles rendered. */
const bubbles = (renders: Renders) =>
  Object.entries(renders.byLabel)
    .filter(([label]) => /^MessageBubble__(own|theirs)$/.test(label))
    .reduce((total, [, count]) => total + count, 0);

test('a typing notice, a message, the clock and Get Info each render only what they change', async ({
  page,
  browser,
}) => {
  // A channel of its own, so nothing another spec sent is in its history.
  const name = `renders-${Date.now().toString(36)}`;
  const writer = await anotherPerson(browser);
  await writer.goto('/login');
  await signIn(writer, 'bob@example.com');
  const chatId = await joinChannel(writer, name);
  for (const line of ['One', 'Two', 'Three', 'Four']) {
    await graphql(
      writer.request,
      'mutation ($input: SendMessageInput!) { sendMessage(input: $input) { id } }',
      { input: { chatId, content: line } }
    );
  }
  await writer.goto(`/${chatId}`);
  const CHAT = `#${name}`;
  const theirs = chatWindow(writer, CHAT).getByRole('textbox', {
    name: 'Message',
  });

  await countRenders(page);
  await page.goto('/login');
  await signIn(page, 'diana@example.com');
  await joinChannel(page, name);
  await page.goto(`/${chatId}`);
  const chat = chatWindow(page, CHAT);
  const history = chat.locator(LOG);
  await expect(history.getByText('Four')).toBeVisible();

  const typing = await rendersDuring(page, LOG, async () => {
    await expect(async () => {
      await theirs.press('a');
      await expect(chat.getByRole('status', { name: 'Typing' })).toHaveText(
        'Bob Smith is typing…',
        { timeout: 1000 }
      );
    }).toPass({ intervals: [3000], timeout: 15_000 });
  });
  // Nothing in the history, but the day's name, should a minute turn
  // meanwhile; nor the history itself, whose frame holds the log.
  const inHistory = Object.entries(typing.insideByLabel).filter(
    ([label]) => label !== 'MessageList__day'
  );
  expect(inHistory).toEqual([]);
  expect(typing.byLabel['MessageList__frame']).toBeUndefined();

  // Its own words each run, should it run again on the same server.
  const words = `Rendered once, ${Date.now()}`;
  const message = await rendersDuring(page, LOG, async () => {
    await theirs.fill(words);
    await theirs.press('Enter');
    await expect(history.getByText(words)).toBeVisible();
  });
  // The new one alone, however many came before it.
  expect(bubbles(message), JSON.stringify(message.byLabel)).toBe(1);

  const tick = await rendersDuring(page, LOG, () =>
    page.evaluate(() => window.dispatchEvent(new Event('focus')))
  );
  expect(bubbles(tick), JSON.stringify(tick.byLabel)).toBe(0);
  // Only what tells the time by the clock: each day's name in the history
  // (a run's time of day doesn't change), and each chat's time in the list.
  expect(tick.total).toBeLessThanOrEqual(
    (tick.byLabel['MessageList__day'] ?? 0) +
      (tick.byLabel['ChatListItem__time'] ?? 0) +
      // The menu bar's clock.
      2
  );

  const info = await rendersDuring(page, LOG, async () => {
    await history.getByText(words).click();
    const dialog = page.getByRole('dialog', { name: 'Message Info' });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });
  expect(bubbles(info), JSON.stringify(info.byLabel)).toBe(0);
});
