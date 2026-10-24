import {
  expect,
  test,
  type APIRequestContext,
  type Locator,
  type Page,
} from '@playwright/test';
import {
  chatWindow,
  feedListening,
  graphql,
  joinChannel,
  newcomer,
  SEEDED_PASSWORD,
} from './support';

/*
 * A chat's history: days named, runs timed by the clock, earlier pages as
 * you reach the top with your place kept, and new messages that wait below
 * while you read further up. Everyone here but the inviter is new, signed up
 * by invite, so the specs cost the login throttle one sign-in in all.
 */

let inviter: APIRequestContext;
test.beforeAll(async ({ playwright }) => {
  inviter = await playwright.request.newContext({
    baseURL: test.info().project.use.baseURL,
  });
  await graphql(
    inviter,
    'mutation ($email: String!, $password: String!) { login(email: $email, password: $password) { user { id } } }',
    { email: 'grace@example.com', password: SEEDED_PASSWORD }
  );
});
test.afterAll(() => inviter.dispose());

/** A channel of its own, `lines` in it from someone else, open on `page` as a newcomer reading it. */
async function history(
  page: Page,
  playwright: Parameters<typeof newcomer>[0],
  lines: number
) {
  const reader = await newcomer(playwright, inviter, 'Reader');
  await page.context().addCookies((await reader.storageState()).cookies);
  const writer = await newcomer(playwright, inviter, 'Writer');
  const name = `history-${Date.now().toString(36)}`;
  const chatId = await joinChannel(page, name);
  await graphql(
    writer,
    'mutation ($name: String!) { joinChannel(name: $name) { id } }',
    { name }
  );
  const say = (content: string) =>
    graphql(
      writer,
      'mutation ($input: SendMessageInput!) { sendMessage(input: $input) { id } }',
      { input: { chatId, content } }
    );
  for (let i = 1; i <= lines; i++) await say(`Line ${i}`);
  const listening = feedListening(page);
  await page.goto(`/${chatId}`);
  const chat = chatWindow(page, `#${name}`);
  const log = chat.getByRole('log');
  await expect(log.getByText(`Line ${lines}`, { exact: true })).toBeVisible();
  await listening;
  return {
    chat,
    log,
    say,
    line: (n: number) => log.getByText(`Line ${n}`, { exact: true }),
  };
}

/** Where a line is on screen, from the top. */
const top = async (locator: Locator) => {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`${locator} has no box`);
  return box.y;
};

test('a history opens at its newest under today’s name, timed by the clock, and fetches earlier pages as you reach the top, in place', async ({
  page,
  playwright,
}) => {
  const { chat, log, line } = await history(page, playwright, 120);

  // The newest page: the 50 latest, today's, each run timed by the clock.
  await expect(line(120)).toBeInViewport();
  await expect(line(70)).toHaveCount(0);
  await expect(chat.getByRole('heading', { name: 'Today' })).toHaveCount(1);
  await expect(log.locator('time').first()).toHaveText(
    /^\d{1,2}:\d{2}\s?[AP]M$/
  );

  // Up to the top: the page before arrives above, and what was in view
  // stays where it was.
  const before = await log.evaluate((element) => {
    element.scrollTop = 0;
    const first = Array.from(element.querySelectorAll('span')).find(
      (span) => span.textContent === 'Line 71'
    );
    return first?.getBoundingClientRect().top ?? NaN;
  });
  await expect(line(70)).toBeAttached();
  expect(Math.abs((await top(line(71))) - before)).toBeLessThanOrEqual(2);

  // And the last page, after which there's nothing more to ask for.
  await log.evaluate((element) => (element.scrollTop = 0));
  await expect(line(1)).toBeAttached();
  await expect(chat.getByText('Loading earlier messages…')).toHaveCount(0);
  await expect(chat.getByRole('heading', { name: 'Today' })).toHaveCount(1);
});

test('read further up, it stays put and offers what arrived; your own message takes you down', async ({
  page,
  playwright,
}) => {
  const { chat, log, say, line } = await history(page, playwright, 30);
  const newer = chat.getByRole('button', { name: /New Message/ });

  await log.evaluate((element) => (element.scrollTop = 0));
  await expect(line(1)).toBeInViewport();
  const reading = await top(line(1));

  await say('Fresh one');
  await say('Fresh two');
  await expect(newer).toHaveText(/^2 New Messages/);
  expect(await top(line(1))).toBe(reading);

  await newer.click();
  await expect(log.getByText('Fresh two')).toBeInViewport();
  await expect(newer).toBeHidden();

  // Read up again: the viewer's own message brings them down to it.
  await log.evaluate((element) => (element.scrollTop = 0));
  await expect(line(1)).toBeInViewport();
  const composer = chat.getByRole('textbox', { name: 'Message' });
  await composer.fill('Mine, at the end');
  await composer.press('Enter');
  await expect(log.getByText('Mine, at the end')).toBeInViewport();
  await expect(newer).toBeHidden();
});
