import {
  expect,
  test as base,
  type APIRequestContext,
  type Locator,
  type Page,
} from '@playwright/test';
import {
  anotherPerson,
  chatsWindow,
  chatWindow,
  graphql,
  joinChannel,
  signIn,
  signInAs,
} from '../tests/support';
import { finger, hold, keyboard, pretendKeyboard } from './touch';

/*
 * On a phone (ADR 0013), on a Pixel's screen and an iPhone's: a chat's title
 * bar has Back and Info, the Chats window's has New…, the composer sits on
 * the keyboard, and a finger held on a message opens Get Info. Each phone is
 * someone of its own, the other's someone else, signed in once for all its
 * tests, so logins stay few under the throttle.
 */

const PEOPLE = {
  iphone: { email: 'frank@example.com', name: 'Frank Moss' },
  pixel: { email: 'grace@example.com', name: 'Grace Hall' },
};
type Phone = keyof typeof PEOPLE;
const me = () => PEOPLE[test.info().project.name as Phone];
const them = () =>
  PEOPLE[test.info().project.name === 'iphone' ? 'pixel' : 'iphone'];

type Cookies = Awaited<
  ReturnType<APIRequestContext['storageState']>
>['cookies'];

const test = base.extend<object, { session: Cookies }>({
  session: [
    async ({ playwright }, use, worker) => {
      const request = await playwright.request.newContext({
        baseURL: worker.project.use.baseURL,
      });
      await signInAs(request, PEOPLE[worker.project.name as Phone].email);
      const { cookies } = await request.storageState();
      await request.dispose();
      await use(cookies);
    },
    { scope: 'worker' },
  ],
  context: async ({ context, session }, use) => {
    await context.addCookies(session);
    await use(context);
  },
});

/** Opens a channel of its own, with `lines` messages in it. */
async function openChannel(page: Page, lines: string[] = []) {
  await page.goto('/');
  const name = `phone-${test.info().project.name}-${Date.now().toString(36)}`;
  const chatId = await joinChannel(page, name);
  for (const content of lines) {
    await graphql(
      page.request,
      'mutation ($input: SendMessageInput!) { sendMessage(input: $input) { id } }',
      { input: { chatId, content } }
    );
  }
  await page.goto(`/${chatId}`);
  const chat = chatWindow(page, `#${name}`);
  await expect(chat).toBeVisible();
  return { name, chat };
}

/** The Chats window's New… menu. */
const newMenu = (page: Page) =>
  page.getByRole('region', { name: 'Chats' }).getByRole('button', {
    name: 'New…',
  });

/**
 * Answers the app's link preview requests itself, with none, so the server
 * never fetches a real site.
 */
async function noPreviews(page: Page) {
  await page.route('**/graphql', async (route) => {
    const body = route.request().postDataJSON() as {
      operationName?: string;
    } | null;
    if (body?.operationName !== 'LinkPreview') return route.fallback();
    await route.fulfill({ json: { data: { linkPreview: null } } });
  });
}

const box = async (locator: Locator) => {
  const found = await locator.boundingBox();
  if (!found) throw new Error(`${locator} has no box`);
  return found;
};

const middle = async (locator: Locator) => {
  const at = await box(locator);
  return { x: at.x + at.width / 2, y: at.y + at.height / 2 };
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
  await expect(chat).not.toContainText(me().name);
  await info.click();
  const people = page.getByRole('dialog', { name: `#${name}` });
  await expect(people.getByRole('list', { name: 'People' })).toContainText(
    me().name
  );
  await expect(
    people.getByRole('button', { name: 'Add People…' })
  ).toBeVisible();
  await people.getByRole('button', { name: 'Done' }).click();
  await expect(people).toBeHidden();

  // Back, to the Chats window.
  const back = chat.getByRole('button', { name: 'Back' });
  expect((await box(back)).height).toBeGreaterThanOrEqual(44);
  expect((await box(back)).width).toBeGreaterThanOrEqual(44);
  await back.click();
  await expect(chat).toBeHidden();
  await expect(chatsWindow(page).getByText(`#${name}`)).toBeVisible();
});

test('New… starts a chat, starts a channel or joins one', async ({ page }) => {
  await page.goto('/');
  for (const [item, dialog] of [
    ['New Chat…', 'New Chat'],
    ['New Channel…', 'New Channel'],
    ['Join Channel…', 'Join a Channel'],
  ] as const) {
    await newMenu(page).click();
    await expect(newMenu(page)).toHaveAttribute('aria-expanded', 'true');
    await page.getByRole('menuitem', { name: item }).click();
    const opened = page.getByRole('dialog', { name: dialog });
    await expect(opened).toBeVisible();
    await expect(newMenu(page)).toHaveAttribute('aria-expanded', 'false');
    await opened.getByRole('button', { name: 'Cancel' }).click();
    await expect(opened).toBeHidden();
  }
});

test('a direct chat’s Info has its two people and no Add People…; the line under its title says who’s typing', async ({
  page,
  browser,
}) => {
  await page.goto('/');
  await newMenu(page).click();
  await page.getByRole('menuitem', { name: 'New Chat…' }).click();
  // Their first name: the field draws what's typed, so the whole name
  // would be found there too.
  await page
    .getByLabel('Find someone to message')
    .fill(them().name.split(' ')[0] ?? '');
  await page
    .getByRole('dialog', { name: 'New Chat' })
    .getByText(them().name)
    .click();
  const chat = chatWindow(page, them().name);
  await expect(chat).toBeVisible();

  await chat.getByRole('button', { name: 'Info' }).click();
  const people = page.getByRole('dialog', { name: them().name });
  const list = people.getByRole('list', { name: 'People' });
  await expect(list).toContainText(me().name);
  await expect(list).toContainText(them().name);
  await expect(people.getByRole('button', { name: 'Add People…' })).toHaveCount(
    0
  );
  await people.getByRole('button', { name: 'Done' }).click();
  await expect(people).toBeHidden();

  // They write, and the line under the title says so; the title stays.
  const writer = await anotherPerson(browser);
  await writer.goto('/login');
  await signIn(writer, them().email);
  await chatsWindow(writer).getByText(me().name, { exact: true }).click();
  const composer = chatWindow(writer, me().name).getByRole('textbox', {
    name: 'Message',
  });
  const status = chat.getByRole('status', { name: 'Typing' });
  await expect(async () => {
    await composer.press('a');
    await expect(status).toHaveText(`${them().name} is typing…`, {
      timeout: 1000,
    });
  }).toPass({ intervals: [3000], timeout: 15_000 });
  const title = chat.getByRole('heading', { name: them().name });
  await expect(title).toBeVisible();
  const under = await box(title);
  expect((await box(status)).y).toBeGreaterThanOrEqual(under.y + under.height);
  await writer.context().close();
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

test('a finger held on a message opens Get Info; a tap, a hold on a link or a scroll past does not', async ({
  page,
}) => {
  await noPreviews(page);
  const lines = Array.from({ length: 30 }, (_, i) => `Line ${i + 1}`);
  const { chat } = await openChannel(page, [
    ...lines,
    'See https://example.com/held',
    'Hold me',
  ]);
  const history = chat.getByRole('log');
  const bubble = history.getByText('Hold me');
  await expect(bubble).toBeInViewport();
  const info = page.getByRole('dialog', { name: 'Message Info' });
  const at = page.url();

  await hold(page, await middle(bubble), 60);
  await page.waitForTimeout(700);
  await expect(info).toBeHidden();

  // A link keeps its own long press.
  await hold(
    page,
    await middle(
      history.getByRole('link', { name: 'https://example.com/held' })
    ),
    700
  );
  await expect(info).toBeHidden();
  expect(page.url()).toBe(at);

  // Scrolling past: put down on a message, and drag the history along.
  const scrolled = () => history.evaluate((log) => log.scrollTop);
  const before = await scrolled();
  const from = await middle(history.getByText('Line 25', { exact: true }));
  const touch = await finger(page, from);
  await touch.moveTo({ x: from.x, y: from.y + 200 }, 10);
  await page.waitForTimeout(700);
  await touch.lift();
  await expect(info).toBeHidden();
  expect(await scrolled()).toBeLessThan(before - 50);

  await history.evaluate((log) => (log.scrollTop = log.scrollHeight));
  await expect(bubble).toBeInViewport();
  await hold(page, await middle(bubble), 700);
  await expect(info).toBeVisible();
});
