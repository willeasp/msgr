import {
  expect,
  test,
  type APIRequestContext,
  type Page,
  type Route,
} from '@playwright/test';
import {
  chatWindow,
  feedListening,
  graphql,
  joinChannel,
  liveConnection,
  newcomer,
  signInAs,
} from './support';

/*
 * Sending: a message shows the moment it's sent, the wristwatch beside it
 * until the server has it, and the field is ready for the next. One that
 * doesn't get there says "Not Sent." with Try Again, which sends it once
 * whatever became of the first try. And a chat whose live connection has
 * been down a moment says "Reconnecting…" until it's back. Everyone here
 * but the inviter is new, signed up by invite, so the specs cost the login
 * throttle one sign-in in all.
 */

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

/** A channel of the page's own, open, as someone new. */
async function chat(page: Page, playwright: Parameters<typeof newcomer>[0]) {
  const sender = await newcomer(playwright, inviter, 'Sender');
  people.push(sender);
  await page.context().addCookies((await sender.storageState()).cookies);
  const name = `sending-${Date.now().toString(36)}`;
  const chatId = await joinChannel(page, name);
  const listening = feedListening(page);
  await page.goto(`/${chatId}`);
  const window = chatWindow(page, `#${name}`);
  await expect(window).toBeVisible();
  await listening;
  const field = window.getByRole('textbox', { name: 'Message' });
  return {
    window,
    log: window.getByRole('log'),
    say: async (words: string) => {
      await field.fill(words);
      await field.press('Enter');
    },
    field,
    /** What the server holds of the chat, oldest first. */
    stored: async () =>
      (
        await graphql<{ messages: { id: string; content: string }[] }>(
          sender,
          'query ($id: ID!) { messages(chatId: $id) { id content } }',
          { id: chatId }
        )
      ).messages,
  };
}

/** Holds each send until the test says how it goes; counts them. */
async function sends(page: Page) {
  const held: Route[] = [];
  let asked = 0;
  await page.route('**/graphql', async (route) => {
    const body = route.request().postDataJSON() as {
      operationName?: string;
    } | null;
    if (body?.operationName !== 'SendMessage') return route.fallback();
    asked++;
    held.push(route);
  });
  const next = async () => {
    await expect.poll(() => held.length).toBeGreaterThan(0);
    const route = held.shift();
    if (!route) throw new Error('No send held');
    return route;
  };
  return {
    asked: () => asked,
    /** Lets the next send through. */
    come: async () => (await next()).fallback(),
    /** Refuses the next send before it reaches the server, failing, or saying why as the server does. */
    refuse: async (reason?: string) =>
      (await next()).fulfill({
        json: {
          errors: [
            reason
              ? { message: reason, extensions: { code: 'BAD_USER_INPUT' } }
              : { message: 'Something went wrong' },
          ],
        },
      }),
    /** Lets the next send reach the server, and holds its answer until the test lets it go. */
    late: async () => {
      const route = await next();
      const response = await route.fetch();
      return () => route.fulfill({ response });
    },
    /** Lets the next send reach the server, and loses its answer. */
    lose: async () => {
      const route = await next();
      await route.fetch();
      await route.abort('connectionreset');
    },
  };
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('a message shows the moment it’s sent, with the wristwatch until the server has it; the field is ready for the next, and they’re stored in the order sent', async ({
  page,
  playwright,
}) => {
  const held = await sends(page);
  const { log, say, field, stored } = await chat(page, playwright);
  const sending = log.getByRole('img', { name: 'Sending' });

  await say('First');
  await expect(log.getByText('First', { exact: true })).toBeVisible();
  await expect(field).toHaveValue('');
  await expect(sending).toHaveCount(1);
  await say('Second');
  await expect(log.getByText('Second', { exact: true })).toBeVisible();
  await expect(sending).toHaveCount(2);
  // One after another, so the server stores them as they were sent: the
  // second waits for the first.
  await expect.poll(held.asked).toBe(1);
  await page.waitForTimeout(300);
  expect(held.asked()).toBe(1);

  await held.come();
  await expect(sending).toHaveCount(1);
  await expect.poll(held.asked).toBe(2);
  await held.come();
  await expect(sending).toHaveCount(0);
  // One run of the viewer's, timed once, now the server has them.
  await expect(log.locator('time')).toHaveCount(1);

  const messages = await stored();
  expect(messages.map(({ content }) => content)).toEqual(['First', 'Second']);
  for (const { id } of messages) expect(id).toMatch(UUID);
});

test('the feed’s word that it got there is as good as the answer: it shows once, sent', async ({
  page,
  playwright,
}) => {
  const held = await sends(page);
  const { log, say } = await chat(page, playwright);

  await say('Heard first');
  const answer = await held.late();
  // The feed brings it, stored, before the send hears back.
  await expect(log.locator('time')).toHaveCount(1);
  await expect(log.getByText('Heard first', { exact: true })).toHaveCount(1);
  await expect(log.getByRole('img', { name: 'Sending' })).toHaveCount(0);
  await answer();
  await page.waitForTimeout(300);
  await expect(log.getByText('Heard first', { exact: true })).toHaveCount(1);
});

test('one that doesn’t get there says Not Sent., keeping its words, and Try Again sends it, once', async ({
  page,
  playwright,
}) => {
  const held = await sends(page);
  const { window, log, say, field, stored } = await chat(page, playwright);
  const notSent = log.getByText(/^Not Sent\./);

  await say('Try me');
  await held.refuse();
  await expect(notSent).toHaveText('Not Sent.');
  await expect(log.getByText('Try me', { exact: true })).toBeVisible();
  await expect(field).toHaveValue('');
  expect(await stored()).toEqual([]);

  await window.getByRole('button', { name: 'Try Again' }).click();
  await expect(log.getByRole('img', { name: 'Sending' })).toHaveCount(1);
  // Its button gone, the keyboard is still in the history.
  await expect(log).toBeFocused();
  await held.come();
  // Stored: it shows its time, which one on its way or not sent never does.
  await expect(log.locator('time')).toHaveCount(1);
  await expect(notSent).toHaveCount(0);
  await expect(log.getByRole('img', { name: 'Sending' })).toHaveCount(0);
  expect((await stored()).map(({ content }) => content)).toEqual(['Try me']);
});

test('one whose answer was lost, while the live connection is down too, is stored once however often it’s tried', async ({
  page,
  playwright,
}) => {
  const connection = await liveConnection(page);
  const held = await sends(page);
  const { window, log, say, stored } = await chat(page, playwright);

  // Nothing comes back by the feed to say it got there.
  await connection.cut();
  await say('Only once');
  await held.lose();
  await expect(log.getByText(/^Not Sent\./)).toBeVisible();
  expect((await stored()).map(({ content }) => content)).toEqual(['Only once']);

  await window.getByRole('button', { name: 'Try Again' }).click();
  await held.come();
  // Stored: it shows its time, which one on its way or not sent never does.
  await expect(log.locator('time')).toHaveCount(1);
  await expect(log.getByText(/^Not Sent\./)).toHaveCount(0);
  await expect(log.getByText('Only once', { exact: true })).toHaveCount(1);
  expect((await stored()).map(({ content }) => content)).toEqual(['Only once']);
  connection.restore();
});

test('one the server refuses says why; one too long to send stays in the field, saying so', async ({
  page,
  playwright,
}) => {
  const held = await sends(page);
  const { window, log, say, field, stored } = await chat(page, playwright);

  await say('Refused');
  await held.refuse('That message can’t be sent here.');
  await expect(log.getByText(/^Not Sent\./)).toHaveText(
    'Not Sent. That message can’t be sent here.'
  );

  // Never sent at all: the server would only refuse it.
  const tooLong = 'a'.repeat(4001);
  await say(tooLong);
  await expect(window.getByRole('alert')).toHaveText(
    'A message can be at most 4,000 characters. This one is 4,001.'
  );
  await expect(field).toHaveValue(tooLong);
  await page.waitForTimeout(300);
  expect(held.asked()).toBe(1);
  // Cut to size, it goes, and the complaint with it.
  await field.press('Backspace');
  await expect(window.getByRole('alert')).toHaveCount(0);
  await field.press('Enter');
  await held.come();
  await expect(log.getByRole('img', { name: 'Sending' })).toHaveCount(0);
  expect((await stored()).map(({ content }) => content.length)).toEqual([
    4000,
  ]);
});

test('a chat says Reconnecting… once its live connection has been down a moment, until it’s back', async ({
  page,
  playwright,
}) => {
  const connection = await liveConnection(page);
  const { window } = await chat(page, playwright);
  const status = window.getByRole('status', { name: 'Connection' });

  const cutAt = Date.now();
  await connection.cut();
  // Two seconds down says so, with the wristwatch; a blip says nothing.
  await expect(status).toHaveText('Reconnecting…', { timeout: 5_000 });
  expect(Date.now() - cutAt).toBeGreaterThanOrEqual(1_900);
  await expect(status.locator('svg')).toHaveCount(1);

  connection.restore();
  // It tries again at most 10 s apart.
  await expect(status).toHaveText('', { timeout: 15_000 });
});
