import { expect, test, type Locator, type Page } from '@playwright/test';
import { anotherPerson, chatWindow, chatsWindow, signIn } from './support';

// A checkerboard, as 64×64 bits in base64.
const CHECKERBOARD = btoa(
  String.fromCharCode(
    ...Array.from({ length: 512 }, (_, i) =>
      Math.floor(i / 8) % 2 ? 0xaa : 0x55
    )
  )
);
const PREVIEW = {
  __typename: 'LinkPreview',
  url: 'https://example.com/page',
  site: 'Example',
  title: 'An example page',
  description: 'A page that only exists in this test.',
  thumbnail: CHECKERBOARD,
};

/**
 * Answers the app's link preview requests itself, so the server never fetches
 * a real site. Set `answer.preview` before a message arrives.
 */
async function fakePreviews(page: Page, answer: { preview: object | null }) {
  await page.route('**/graphql', async (route) => {
    const body = route.request().postDataJSON() as {
      operationName?: string;
    } | null;
    if (body?.operationName !== 'LinkPreview') return route.fallback();
    await route.fulfill({
      json: { data: { linkPreview: answer.preview } },
    });
  });
}

async function say(page: Page, words: string) {
  const box = page.getByLabel('Message', { exact: true });
  await box.focus();
  await page.keyboard.type(words);
  await page.keyboard.press('Enter');
  await expect(box).toHaveValue('');
}

const maskOf = (element: Locator) =>
  element.evaluate((node) => {
    const style = getComputedStyle(node);
    return style.maskImage || style.webkitMaskImage;
  });

test('links open in a new tab, and the first gets a card', async ({
  page,
  browser,
}) => {
  const answer: { preview: object | null } = { preview: PREVIEW };
  const charlie = await anotherPerson(browser);
  await fakePreviews(page, answer);
  await fakePreviews(charlie, answer);
  await page.goto('/login');
  await signIn(page, 'test@example.com');
  await charlie.goto('/login');
  await signIn(charlie, 'charlie@example.com');
  await chatsWindow(page).getByText('Charlie Brown', { exact: true }).click();
  await chatsWindow(charlie).getByText('Test User', { exact: true }).click();

  await say(page, 'look at https://example.com/page.');

  for (const chat of [
    chatWindow(page, 'Charlie Brown'),
    chatWindow(charlie, 'Test User'),
  ]) {
    const link = chat.getByRole('link', {
      name: 'https://example.com/page',
      exact: true,
    });
    await expect(link).toHaveAttribute('href', 'https://example.com/page');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);

    const card = chat.getByRole('link', { name: /An example page/ });
    await expect(card).toContainText('Example');
    await expect(card).toContainText('A page that only exists in this test.');
    await expect(card).toHaveAttribute('href', 'https://example.com/page');
    const picture = card.locator(':scope > :first-child');
    expect((await picture.boundingBox())?.width).toBe(64);
    expect(await maskOf(picture)).toContain('data:image/svg+xml');
  }

  // A focused link shows where it is, even in the viewer's inverted bubble.
  const own = chatWindow(page, 'Charlie Brown').getByRole('link', {
    name: 'https://example.com/page',
    exact: true,
  });
  await own.focus();
  expect(
    await own.evaluate((node) => getComputedStyle(node).outlineStyle)
  ).not.toBe('none');

  // A page with nothing to preview leaves just the link.
  answer.preview = null;
  await say(page, 'and https://example.com/none');
  const chat = chatWindow(charlie, 'Test User');
  await expect(
    chat.getByRole('link', { name: 'https://example.com/none', exact: true })
  ).toBeVisible();
  await expect(chat.getByRole('link', { name: /An example page/ })).toHaveCount(
    1
  );
});
