import { expect, test } from '@playwright/test';
import { countRenders, rendersDuring, type Renders } from './renders';
import { anotherPerson, chatWindow, chatsWindow, signIn } from './support';

/*
 * What happens re-renders only what shows it (CLAUDE.md, "Render what
 * changed"): measured in the production build, through the hook React
 * DevTools uses (renders.ts).
 */

const LOG = '[role="log"]';
const CHAT = 'Project Team';

/** How many message bubbles rendered, the time beside one not counted. */
const bubbles = (renders: Renders) =>
  Object.entries(renders.byLabel)
    .filter(([label]) => /^MessageBubble__(own|theirs)$/.test(label))
    .reduce((total, [, count]) => total + count, 0);

test('a typing notice, a message, the clock and Get Info each render only what they change', async ({
  page,
  browser,
}) => {
  const writer = await anotherPerson(browser);
  await writer.goto('/login');
  await signIn(writer, 'bob@example.com');
  await chatsWindow(writer).getByText(CHAT, { exact: true }).click();
  const theirs = chatWindow(writer, CHAT).getByRole('textbox', {
    name: 'Message',
  });

  await countRenders(page);
  await page.goto('/login');
  await signIn(page, 'diana@example.com');
  await chatsWindow(page).getByText(CHAT, { exact: true }).click();
  const chat = chatWindow(page, CHAT);
  const history = chat.locator(LOG);
  await expect(history.getByText('Welcome to the project team')).toBeVisible();

  const typing = await rendersDuring(page, LOG, async () => {
    await expect(async () => {
      await theirs.press('a');
      await expect(chat.getByRole('status', { name: 'Typing' })).toHaveText(
        'Bob Smith is typing…',
        { timeout: 1000 }
      );
    }).toPass({ intervals: [3000], timeout: 15_000 });
  });
  expect(typing.inside, JSON.stringify(typing.byLabel)).toBe(0);

  const message = await rendersDuring(page, LOG, async () => {
    await theirs.fill('Rendered once');
    await theirs.press('Enter');
    await expect(history.getByText('Rendered once')).toBeVisible();
  });
  // The new one alone, however many came before it.
  expect(bubbles(message), JSON.stringify(message.byLabel)).toBe(1);

  const tick = await rendersDuring(page, LOG, () =>
    page.evaluate(() => window.dispatchEvent(new Event('focus')))
  );
  expect(bubbles(tick), JSON.stringify(tick.byLabel)).toBe(0);
  // Only the times changed: each run's time, and each chat's in the list.
  expect(tick.total).toBeLessThanOrEqual(
    (tick.byLabel['MessageBubble__time'] ?? 0) +
      (tick.byLabel['ChatListItem__time'] ?? 0) +
      // The menu bar's clock.
      2
  );

  const info = await rendersDuring(page, LOG, async () => {
    await history.getByText('Rendered once').click();
    const dialog = page.getByRole('dialog', { name: 'Message Info' });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });
  expect(bubbles(info), JSON.stringify(info.byLabel)).toBe(0);
});
