import { expect, test, type Locator, type Page } from '@playwright/test';
import { chatsWindow, chatWindow, joinChannel, signIn } from '../tests/support';
import { finger, hold, keyboard, pretendKeyboard } from './touch';

/*
 * On a phone (ADR 0013), on a Pixel's screen and an iPhone's: a chat's title
 * bar has Back and Info, the composer sits on the keyboard, and a finger held
 * on a message opens Get Info. Each phone signs in as someone of its own,
 * with logins to spare under the throttle.
 */

const person = () =>
  test.info().project.name === 'iphone'
    ? 'frank@example.com'
    : 'grace@example.com';

async function graphql(page: Page, query: string, variables = {}) {
  const response = await page.request.post('/graphql', {
    data: { query, variables },
  });
  const body = (await response.json()) as { errors?: unknown[] };
  if (body.errors) throw new Error(JSON.stringify(body.errors));
}

/** Signs in and opens a channel of its own, with `lines` messages in it. */
async function openChannel(page: Page, lines: string[] = []) {
  await page.goto('/login');
  await signIn(page, person());
  const name = `phone-${test.info().project.name}-${Date.now().toString(36)}`;
  const chatId = await joinChannel(page, name);
  for (const content of lines) {
    await graphql(
      page,
      'mutation ($input: SendMessageInput!) { sendMessage(input: $input) { id } }',
      { input: { chatId, content } }
    );
  }
  await page.goto(`/${chatId}`);
  const chat = chatWindow(page, `#${name}`);
  await expect(chat).toBeVisible();
  return { name, chat };
}

const box = async (locator: Locator) => {
  const found = await locator.boundingBox();
  if (!found) throw new Error(`${locator} has no box`);
  return found;
};

test('a chat’s title bar has Back and Info, each a thumb’s target', async ({
  page,
}) => {
  const { name, chat } = await openChannel(page);

  // Info: the chat's people, and Add People…, off the line under the title.
  const info = chat.getByRole('button', { name: 'Info' });
  expect((await box(info)).height).toBeGreaterThanOrEqual(44);
  expect((await box(info)).width).toBeGreaterThanOrEqual(44);
  await expect(chat.getByRole('button', { name: 'Add People…' })).toBeHidden();
  await info.click();
  const people = page.getByRole('dialog', { name: `#${name}` });
  await expect(people.getByRole('list', { name: 'People' })).toContainText(
    test.info().project.name === 'iphone' ? 'Frank Moss' : 'Grace Hall'
  );
  await expect(
    people.getByRole('button', { name: 'Add People…' })
  ).toBeVisible();
  await people.getByRole('button', { name: 'Done' }).click();
  await expect(people).toBeHidden();

  // Back, to the Chats window, which offers New….
  const back = chat.getByRole('button', { name: 'Back' });
  expect((await box(back)).height).toBeGreaterThanOrEqual(44);
  expect((await box(back)).width).toBeGreaterThanOrEqual(44);
  await back.click();
  await expect(chat).toBeHidden();
  await expect(chatsWindow(page).getByText(`#${name}`)).toBeVisible();
  await page
    .getByRole('region', { name: 'Chats' })
    .getByRole('button', { name: 'New…' })
    .click();
  await expect(page.getByRole('menuitem', { name: 'New Chat…' })).toBeVisible();
  await expect(
    page.getByRole('menuitem', { name: 'Join Channel…' })
  ).toBeVisible();
});

test('the composer sits on the keyboard, the history kept at its end', async ({
  page,
}) => {
  await pretendKeyboard(page);
  const lines = Array.from({ length: 30 }, (_, i) => `Line ${i + 1}`);
  const { chat } = await openChannel(page, lines);
  const history = chat.getByRole('log');
  await expect(history.getByText('Line 30', { exact: true })).toBeInViewport();
  await chat.getByRole('textbox', { name: 'Message' }).click();

  // A keyboard comes up: the composer on it, the latest message in view,
  // the menu bar still at the top.
  const screen = page.viewportSize() ?? { width: 0, height: 0 };
  const form = chat.locator('form');
  const formBottom = async () => {
    const at = await box(form);
    return Math.round(at.y + at.height);
  };
  await keyboard(page, 300);
  await expect
    .poll(formBottom)
    .toBeGreaterThanOrEqual(screen.height - 300 - 40);
  expect(await formBottom()).toBeLessThanOrEqual(screen.height - 300);
  await expect(history.getByText('Line 30', { exact: true })).toBeInViewport();
  expect((await box(page.getByRole('banner'))).y).toBeLessThanOrEqual(1);

  // iOS slides the page up under its keyboard: the screen follows it.
  await keyboard(page, 300, 120);
  await expect
    .poll(async () => Math.round((await box(page.getByRole('banner'))).y))
    .toBe(120);
  await keyboard(page, 0);
  await expect
    .poll(async () => Math.round((await box(page.getByRole('banner'))).y))
    .toBe(0);
});

test('a finger held on a message opens Get Info; a tap or a scroll past does not', async ({
  page,
}) => {
  const { chat } = await openChannel(page, ['Hold me']);
  const bubble = chat.getByRole('log').getByText('Hold me');
  const at = await box(bubble);
  const middle = { x: at.x + at.width / 2, y: at.y + at.height / 2 };
  const info = page.getByRole('dialog', { name: 'Message Info' });

  await hold(page, middle, 60);
  await page.waitForTimeout(700);
  await expect(info).toBeHidden();

  // Scrolling past: down, then moving away.
  const touch = await finger(page, middle);
  await touch.moveTo({ x: middle.x, y: middle.y + 60 }, 4);
  await page.waitForTimeout(700);
  await touch.lift();
  await expect(info).toBeHidden();

  await hold(page, middle, 700);
  await expect(info).toBeVisible();
});
