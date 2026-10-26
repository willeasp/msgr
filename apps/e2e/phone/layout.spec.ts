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
  feedListening,
  graphql,
  halfInkPicture,
  joinChannel,
  liveConnection,
  newcomer,
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

test('the line under a chat’s title says Reconnecting… at its end, as it says who’s typing', async ({
  page,
}) => {
  const connection = await liveConnection(page);
  const { chat } = await openChannel(page);
  // Listening, so that what's cut was up.
  const listening = feedListening(page);
  await page.reload();
  await expect(chat).toBeVisible();
  await listening;
  const status = chat.getByRole('status', { name: 'Connection' });

  await connection.cut();
  await expect(status).toHaveText('Reconnecting…', { timeout: 5_000 });
  const title = await box(chat.getByRole('heading'));
  const said = await box(status);
  const window = await box(chat);
  expect(said.y).toBeGreaterThanOrEqual(title.y + title.height);
  // At the end of the line, where typing shows, not adrift in its middle.
  expect(window.x + window.width - (said.x + said.width)).toBeLessThan(24);
  connection.restore();
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

test('a tap on a picture opens it full screen, the desktop’s pattern around it; a tap closes it, and a finger held on it opens Get Info', async ({
  page,
}) => {
  await page.goto('/');
  const name = `phone-${test.info().project.name}-${Date.now().toString(36)}`;
  const chatId = await joinChannel(page, name);
  await graphql(
    page.request,
    'mutation ($input: SendMessageInput!) { sendMessage(input: $input) { id } }',
    { input: { chatId, picture: halfInkPicture() } }
  );
  await page.goto(`/${chatId}`);
  const inChat = chatWindow(page, `#${name}`)
    .getByRole('log')
    .getByRole('img', { name: 'Picture' });
  await expect(inChat).toBeVisible();
  const full = page.getByRole('dialog', { name: 'Your Picture' });
  const shown = full.getByRole('img', { name: 'Picture' });

  await inChat.tap();
  await expect(shown).toBeVisible();
  // A window filling the screen, the picture nearly its width, the
  // desktop's pattern above and below it.
  const screen = page.viewportSize();
  const window = await box(full);
  expect(window.width).toBeCloseTo(screen?.width ?? 0, 0);
  const picture = await box(shown);
  expect(picture.width).toBeGreaterThan(window.width * 0.9);
  expect(picture.width).toBeLessThanOrEqual(window.width);
  expect(picture.width).toBeGreaterThan((await box(inChat)).width);
  expect(picture.y).toBeGreaterThan(window.y + 100);
  expect(picture.y + picture.height).toBeLessThan(
    window.y + window.height - 100
  );
  expect(
    await shown.evaluate(
      (canvas) =>
        getComputedStyle(canvas.parentElement ?? canvas).backgroundImage
    )
  ).toContain('conic-gradient');

  // A tap on the pattern closes it, and so does Back.
  await page.touchscreen.tap(window.x + 20, picture.y + picture.height + 40);
  await expect(full).toHaveCount(0);
  await inChat.tap();
  await full.getByRole('button', { name: 'Back' }).tap();
  await expect(full).toHaveCount(0);
  await expect(chatWindow(page, `#${name}`)).toBeVisible();

  // A finger held on it is Get Info's, as on any message.
  await hold(page, await middle(inChat), 700);
  await expect(
    page.getByRole('dialog', { name: 'Message Info' })
  ).toBeVisible();
  await expect(full).toHaveCount(0);
});

test('a run’s messages keep the room its time takes beside the first, so the run lines up with it', async ({
  page,
  playwright,
}) => {
  await page.goto('/');
  const name = `phone-${test.info().project.name}-${Date.now().toString(36)}`;
  const chatId = await joinChannel(page, name);
  // Someone new, by an invite: no login against the throttle.
  const other = await newcomer(playwright, page.request, 'Writer');
  await graphql(
    other,
    'mutation ($name: String!) { joinChannel(name: $name) { id } }',
    { name }
  );
  const send =
    'mutation ($input: SendMessageInput!) { sendMessage(input: $input) { id } }';
  const first = 'A first message with words enough to wrap across a phone';
  const next =
    'A follow-up with words enough to fill a phone from side to side, so it wraps';
  for (const [from, content] of [
    [other, first],
    [other, next],
    [page.request, `${first}, mine.`],
    [page.request, `${next}, mine.`],
  ] as const) {
    await graphql(from, send, { input: { chatId, content } });
  }
  await other.dispose();
  await page.goto(`/${chatId}`);
  const log = chatWindow(page, `#${name}`).getByRole('log');
  await expect(log.locator('time')).toHaveCount(2);
  const words = (text: string) => box(log.getByText(text, { exact: true }));

  // Theirs: the follow-up ends where the first does, short of the first's
  // time, which sits at the foot of its bubble.
  const [theirFirst, theirNext] = [await words(first), await words(next)];
  const theirTime = await box(log.locator('time').first());
  expect(theirNext.height).toBeGreaterThan(theirTime.height * 1.5);
  expect(
    Math.abs(theirNext.x + theirNext.width - (theirFirst.x + theirFirst.width))
  ).toBeLessThanOrEqual(1);
  expect(theirFirst.x + theirFirst.width).toBeLessThan(theirTime.x);
  // The bubble's foot: its words' and its 4 pixels of padding.
  expect(
    Math.abs(
      theirTime.y + theirTime.height - (theirFirst.y + theirFirst.height + 4)
    )
  ).toBeLessThanOrEqual(1);

  // The viewer's, mirrored.
  const [myFirst, myNext] = [
    await words(`${first}, mine.`),
    await words(`${next}, mine.`),
  ];
  const myTime = await box(log.locator('time').last());
  expect(Math.abs(myNext.x - myFirst.x)).toBeLessThanOrEqual(1);
  expect(myFirst.x).toBeGreaterThan(myTime.x + myTime.width);
});
