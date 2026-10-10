import { expect, test, type Locator, type Page } from '@playwright/test';
import { anotherPerson, chatWindow, chatsWindow, signIn } from './support';

/**
 * The pixel art standing in for an emoji: the element around its (invisible)
 * character. 😀 is hand-drawn, so it looks the same on machines without an
 * emoji font, like CI's.
 */
const pixel = (scope: Locator, emoji: string) =>
  scope.getByText(emoji, { exact: true }).locator('..');

const look = (element: Locator) =>
  element.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      mask: style.maskImage || style.webkitMaskImage,
      height: node.getBoundingClientRect().height,
      // The text colour it's painted in, against the colour around it.
      paint: style.backgroundColor,
      text: node.parentElement
        ? getComputedStyle(node.parentElement).color
        : '',
    };
  });

async function say(page: Page, words: string) {
  const box = page.getByLabel('Message', { exact: true });
  await box.focus();
  await page.keyboard.type(words);
  await page.keyboard.press('Enter');
  await expect(box).toHaveValue('');
}

test('emoji arrive as pixel art, big when they are the whole message', async ({
  page,
  browser,
}) => {
  const charlie = await anotherPerson(browser);
  await page.goto('/login');
  await signIn(page, 'test@example.com');
  await charlie.goto('/login');
  await signIn(charlie, 'charlie@example.com');
  await chatsWindow(page).getByText('Charlie Brown', { exact: true }).click();
  await chatsWindow(charlie).getByText('Test User', { exact: true }).click();

  await say(page, 'Morning 😀 🚀');
  const chat = chatWindow(charlie, 'Test User');
  // The words and the real characters are all still there, for copying.
  await expect(chat.getByText('Morning 😀 🚀')).toBeVisible();
  const inText = await look(pixel(chat, '😀').first());
  expect(inText.mask).toContain('data:image/svg+xml');
  expect(inText.height).toBe(16);
  expect(inText.paint).toBe(inText.text);

  await say(page, '😀');
  await expect(pixel(chat, '😀')).toHaveCount(2);
  expect((await look(pixel(chat, '😀').last())).height).toBe(32);

  // The viewer's own bubbles are inverted; the emoji follows their text.
  const own = await look(
    pixel(chatWindow(page, 'Charlie Brown'), '😀').first()
  );
  expect(own.paint).toBe(own.text);

  const preview = await look(pixel(chatsWindow(charlie), '😀'));
  expect(preview.mask).toContain('data:image/svg+xml');

  // A rocket joined to a pizza is one emoji to the text, but no font draws it
  // as one: it stays as its characters rather than a cropped blob.
  await say(page, '🚀\u200d🍕');
  const unjoined = await look(pixel(chat, '🚀\u200d🍕'));
  expect(unjoined.mask).toBe('none');
});

test('in forced colours, like Windows High Contrast, emoji stay visible', async ({
  browser,
}) => {
  const page = await anotherPerson(browser);
  await page.emulateMedia({ forcedColors: 'active' });
  await page.goto('/login');
  await signIn(page, 'diana@example.com');
  await chatsWindow(page).getByText('#general', { exact: true }).click();

  // The seed's "Morning, everyone! 😀".
  const morning = await look(pixel(chatWindow(page, '#general'), '😀'));
  expect(morning.paint).toBe(morning.text);
});
