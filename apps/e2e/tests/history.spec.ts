import {
  expect,
  test,
  type APIRequestContext,
  type Locator,
  type Page,
  type Request,
} from '@playwright/test';
import {
  chatsWindow,
  chatWindow,
  feedListening,
  graphql,
  joinChannel,
  newcomer,
  signInAs,
} from './support';

/*
 * A chat's history: days named, runs timed by the clock, earlier pages as you
 * reach the top with your place kept, and new messages that wait below,
 * unread, while you read further up. Everyone here but the inviter is new,
 * signed up by invite, so the specs cost the login throttle one sign-in in
 * all.
 */

const SEND =
  'mutation ($input: SendMessageInput!) { sendMessage(input: $input) { id } }';

let inviter: APIRequestContext;
const people: APIRequestContext[] = [];
test.beforeAll(async ({ playwright }) => {
  inviter = await playwright.request.newContext({
    baseURL: test.info().project.use.baseURL,
  });
  await signInAs(inviter, 'grace@example.com');
});
test.afterEach(async () => {
  await Promise.all(people.splice(0).map((person) => person.dispose()));
});
test.afterAll(() => inviter.dispose());

/** A channel of its own, `lines` in it from someone else, open on `page` as a newcomer reading it. */
async function history(
  page: Page,
  playwright: Parameters<typeof newcomer>[0],
  lines: number
) {
  const reader = await newcomer(playwright, inviter, 'Reader');
  const writer = await newcomer(playwright, inviter, 'Writer');
  people.push(reader, writer);
  await page.context().addCookies((await reader.storageState()).cookies);
  const name = `history-${Date.now().toString(36)}`;
  const chatId = await joinChannel(page, name);
  await graphql(
    writer,
    'mutation ($name: String!) { joinChannel(name: $name) { id } }',
    { name }
  );
  const say = (content: string, from = writer) =>
    graphql(from, SEND, { input: { chatId, content } });
  for (let i = 1; i <= lines; i++) await say(`Line ${i}`);
  const listening = feedListening(page);
  await page.goto(`/${chatId}`);
  const chat = chatWindow(page, `#${name}`);
  const log = chat.getByRole('log');
  await expect(log.getByText(`Line ${lines}`, { exact: true })).toBeVisible();
  await listening;
  return {
    name,
    chat,
    log,
    reader,
    say,
    line: (n: number) => log.getByText(`Line ${n}`, { exact: true }),
  };
}

/** Whether a request asks for a page of earlier messages. */
function asksEarlier(request: Request) {
  if (request.method() !== 'POST') return false;
  const body = request.postDataJSON() as {
    operationName?: string;
    variables?: { before?: string };
  } | null;
  return body?.operationName === 'GetChatMessages' && !!body.variables?.before;
}

/**
 * Holds each request for a page of earlier messages until the test lets it
 * come, or makes it fail; and counts them.
 */
async function earlierPages(page: Page) {
  let asked = 0;
  let waiting: ((failing: boolean) => void) | null = null;
  await page.route('**/graphql', async (route) => {
    if (!asksEarlier(route.request())) return route.fallback();
    asked++;
    const failing = await new Promise<boolean>((resolve) => {
      waiting = resolve;
    });
    if (!failing) return route.fallback();
    return route.fulfill({
      json: {
        data: null,
        errors: [
          {
            message: 'Something went wrong',
            extensions: { code: 'INTERNAL_SERVER_ERROR' },
          },
        ],
      },
    });
  });
  const answer = async (failing: boolean) => {
    await expect.poll(() => waiting).not.toBeNull();
    const resolve = waiting;
    waiting = null;
    resolve?.(failing);
  };
  return {
    asked: () => asked,
    come: () => answer(false),
    fail: () => answer(true),
  };
}

/** Where a line is on screen, from the top. */
const top = async (locator: Locator) => {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`${locator} has no box`);
  return box.y;
};

const toTop = (log: Locator) =>
  log.evaluate((element) => (element.scrollTop = 0));

test('a history opens at its newest under today’s name, timed once a run by the clock, and fetches each earlier page as you reach the top, in place', async ({
  page,
  playwright,
}) => {
  const pages = await earlierPages(page);
  const { chat, log, line } = await history(page, playwright, 120);
  const loading = chat.getByText('Loading earlier messages…');

  // The newest page: the 50 latest, today's, one sender's run timed once.
  await expect(line(120)).toBeInViewport();
  await expect(line(70)).toHaveCount(0);
  await expect(chat.getByRole('heading', { name: 'Today' })).toHaveCount(1);
  await expect(log.locator('time')).toHaveCount(1);
  await expect(log.locator('time')).toHaveText(/^\d{1,2}:\d{2}\s?[AP]M$/);

  // Up to the top: the wristwatch while the page before comes; then it's
  // above, and what was in view hasn't moved at all.
  await toTop(log);
  await expect(loading).toBeVisible();
  const reading = await top(line(71));
  await pages.come();
  await expect(line(70)).toBeAttached();
  await expect(loading).toHaveCount(0);
  await expect.poll(() => top(line(71))).toBe(reading);

  // And the last, short of a page: the row that asked goes, in place too.
  await toTop(log);
  await expect(loading).toBeVisible();
  const last = await top(line(21));
  await pages.come();
  await expect(line(1)).toBeAttached();
  await expect.poll(() => top(line(21))).toBe(last);
  await expect(chat.getByRole('heading', { name: 'Today' })).toHaveCount(1);

  // Nothing more to ask for, however far up you go.
  await toTop(log);
  await page.waitForTimeout(500);
  expect(pages.asked()).toBe(2);
});

test('the keyboard pages through it; an earlier page that fails says so and tries again; one that comes late, after you went back down and talk went on, leaves you at the newest', async ({
  page,
  playwright,
}) => {
  const pages = await earlierPages(page);
  const { chat, log, say, line } = await history(page, playwright, 120);

  // Focused, Home goes to the top, which asks for the page before.
  await log.focus();
  await expect(log).toBeFocused();
  await page.keyboard.press('Home');
  await pages.fail();
  await expect(chat.getByText('Couldn’t load earlier messages.')).toBeVisible();
  await chat.getByRole('button', { name: 'Try Again' }).click();
  await pages.come();
  await expect(line(70)).toBeAttached();
  await expect(chat.getByText('Couldn’t load earlier messages.')).toHaveCount(
    0
  );

  // Asked again, but back down at the end before it comes, as talk goes on.
  await toTop(log);
  await expect.poll(pages.asked).toBe(3);
  await log.evaluate((element) => (element.scrollTop = element.scrollHeight));
  await say('Meanwhile');
  await expect(log.getByText('Meanwhile')).toBeInViewport();
  await pages.come();
  await expect(line(20)).toBeAttached();
  await expect(log.getByText('Meanwhile')).toBeInViewport();
});

test('read further up, it stays put while what arrives waits below, unread, with a button to it; a send from this window takes you down, one from elsewhere doesn’t', async ({
  page,
  playwright,
}) => {
  const { name, chat, log, reader, say, line } = await history(
    page,
    playwright,
    30
  );
  const newer = chat.getByRole('button', { name: /New Message/ });
  const row = chatsWindow(page).getByRole('link', { name: new RegExp(name) });

  // At the end, what arrives is shown, and read.
  await say('At the end');
  await expect(log.getByText('At the end')).toBeInViewport();
  await expect(newer).toBeHidden();
  await expect(row).not.toContainText(/\d+ unread/);

  await toTop(log);
  await expect(line(1)).toBeInViewport();
  const reading = await top(line(1));

  await say('Fresh one');
  await say('Fresh two');
  await expect(newer).toHaveText(/^2 New Messages/);
  expect(await top(line(1))).toBe(reading);
  // Not seen, so not read: the chat list counts them.
  await expect(row).toContainText(/(^|\D)2 unread/);

  // The viewer's own, from their phone: no reason to leave their place.
  await say('From my phone', reader);
  await expect(log.getByText('From my phone')).toBeAttached();
  await expect(newer).toHaveText(/^2 New Messages/);
  expect(await top(line(1))).toBe(reading);

  await newer.click();
  await expect(log.getByText('From my phone')).toBeInViewport();
  await expect(newer).toBeHidden();
  await expect(log).toBeFocused();

  // Read up again: a message sent from this window takes them to it.
  await toTop(log);
  await expect(line(1)).toBeInViewport();
  const composer = chat.getByRole('textbox', { name: 'Message' });
  await composer.fill('Mine, at the end');
  await composer.press('Enter');
  await expect(log.getByText('Mine, at the end')).toBeInViewport();
  await expect(newer).toBeHidden();
  // The writer's run, then the viewer's: each timed once.
  await expect(log.locator('time')).toHaveCount(2);
});

test('away from the newest, what grows above the line being read moves nothing; at the newest, what grows keeps it in view', async ({
  page,
  playwright,
}) => {
  // Link previews, each answered when the test lets it come.
  const held: (() => void)[] = [];
  await page.route('**/graphql', async (route) => {
    const body = route.request().postDataJSON() as {
      operationName?: string;
    } | null;
    if (body?.operationName !== 'LinkPreview') return route.fallback();
    await new Promise<void>((resolve) => held.push(resolve));
    await route.fulfill({
      json: {
        data: {
          linkPreview: {
            __typename: 'LinkPreview',
            url: 'https://example.com/page',
            site: 'Example',
            title: 'An example page',
            description: 'A page that only exists in this test.',
            thumbnail: null,
          },
        },
      },
    });
  });
  const previewComes = async () => {
    await expect.poll(() => held.length).toBeGreaterThan(0);
    held.shift()?.();
  };
  const reader = await newcomer(playwright, inviter, 'Reader');
  people.push(reader);
  await page.context().addCookies((await reader.storageState()).cookies);
  const name = `grows-${Date.now().toString(36)}`;
  const chatId = await joinChannel(page, name);
  await graphql(reader, SEND, {
    input: { chatId, content: 'Read https://example.com/page' },
  });
  for (let i = 1; i <= 30; i++) {
    await graphql(reader, SEND, { input: { chatId, content: `Line ${i}` } });
  }
  await page.goto(`/${chatId}`);
  const log = chatWindow(page, `#${name}`).getByRole('log');
  const line = (n: number) => log.getByText(`Line ${n}`, { exact: true });
  await expect(line(30)).toBeInViewport();

  // Reading line 10, the link's card arrives far above it.
  await expect.poll(() => held.length).toBe(1);
  await line(10).evaluate((node) => node.scrollIntoView({ block: 'start' }));
  const reading = await top(line(10));
  await previewComes();
  await expect(log.getByText('An example page')).toBeAttached();
  await expect.poll(() => top(line(10))).toBe(reading);

  // At the newest, a card arriving keeps the newest in view.
  await log.evaluate((element) => (element.scrollTop = element.scrollHeight));
  await graphql(reader, SEND, {
    input: { chatId, content: 'And https://example.com/page' },
  });
  await expect(log.getByText('And https://example.com/page')).toBeInViewport();
  await previewComes();
  await expect(log.getByText('An example page')).toHaveCount(2);
  await expect(log.getByText('And https://example.com/page')).toBeInViewport();
});

test('at midnight, today becomes yesterday', async ({ page, playwright }) => {
  await page.clock.install();
  const { chat } = await history(page, playwright, 3);
  await expect(chat.getByRole('heading', { name: 'Today' })).toBeVisible();

  const midnight = new Date();
  midnight.setHours(24, 1, 0, 0);
  await page.clock.setSystemTime(midnight);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(chat.getByRole('heading', { name: 'Yesterday' })).toBeVisible();
  await expect(chat.getByRole('heading', { name: 'Today' })).toHaveCount(0);
});
