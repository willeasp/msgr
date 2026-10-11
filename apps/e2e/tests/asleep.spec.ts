import { devices, expect, test, type Page } from '@playwright/test';
import {
  anotherPerson,
  chatWindow,
  chatsWindow,
  menuBar,
  signIn,
} from './support';

/*
 * A phone that sleeps drops its live connection and stops its timers. What it
 * shows when it wakes must still add up.
 */

/** A phone whose live connection can be cut, and kept cut, at will. */
async function phone(page: Page) {
  const connection = { up: true, close: async () => undefined as void };
  await page.routeWebSocket(/\/graphql$/, (socket) => {
    if (!connection.up) return void socket.close({ code: 4000 });
    socket.connectToServer();
    connection.close = () => socket.close({ code: 4000 });
  });
  return {
    async cut() {
      connection.up = false;
      await connection.close();
    },
    restore() {
      connection.up = true;
    },
  };
}

const photo = (page: Page) =>
  page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 40;
    canvas.height = 20;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No canvas');
    context.fillRect(0, 0, 20, 20);
    const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done));
    if (!blob) throw new Error('No PNG');
    return [...new Uint8Array(await blob.arrayBuffer())];
  });

test('what you send while the connection is down still shows in the chat list', async ({
  browser,
}) => {
  const page = await (
    await browser.newContext({ ...devices['Pixel 7'] })
  ).newPage();
  const connection = await phone(page);
  await page.goto('/login');
  await signIn(page, 'test@example.com');
  await chatsWindow(page).getByText('#general').click();
  await connection.cut();

  const chat = chatWindow(page, '#general');
  const chooser = page.waitForEvent('filechooser');
  await chat.getByRole('button', { name: 'Picture…' }).click();
  await (
    await chooser
  ).setFiles({
    name: 'p.png',
    mimeType: 'image/png',
    buffer: Buffer.from(await photo(page)),
  });
  await chat.getByRole('textbox', { name: 'Message' }).fill('sent asleep');
  await chat.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(chat.getByRole('textbox', { name: 'Message' })).toHaveValue('');

  await page.goBack();
  await expect(
    chatsWindow(page).getByRole('link', { name: /#general/ })
  ).toContainText('sent asleep');
});

test('what arrived while the connection was down shows once it is back', async ({
  browser,
}) => {
  const page = await (
    await browser.newContext({ ...devices['Pixel 7'] })
  ).newPage();
  const connection = await phone(page);
  await page.goto('/login');
  await signIn(page, 'charlie@example.com');
  await connection.cut();

  const bob = await anotherPerson(browser);
  await bob.goto('/login');
  await signIn(bob, 'bob@example.com');
  await chatsWindow(bob).getByText('#general').click();
  const chat = chatWindow(bob, '#general');
  await chat.getByRole('textbox', { name: 'Message' }).fill('while you slept');
  await chat.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(chat.getByRole('textbox', { name: 'Message' })).toHaveValue('');

  connection.restore();
  await expect(
    chatsWindow(page).getByRole('link', { name: /#general/ })
  ).toContainText('while you slept', { timeout: 15_000 });
});

test('on waking, the clock and every "ago" catch up at once', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/login');
  await signIn(page, 'alice@example.com');
  await chatsWindow(page).getByText('#general').click();
  const chat = chatWindow(page, '#general');
  await chat.getByRole('textbox', { name: 'Message' }).fill('before sleep');
  await chat.getByRole('button', { name: 'Send', exact: true }).click();
  const row = chatsWindow(page).getByRole('link', { name: /#general/ });
  await expect(row).toContainText('Just now');

  // Asleep: time passes, but no timer runs.
  await page.clock.setSystemTime(Date.now() + 20 * 60_000);
  await page.evaluate(() =>
    document.dispatchEvent(new Event('visibilitychange'))
  );

  const now = await page.evaluate(() =>
    new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  );
  await expect(menuBar(page).locator('time')).toHaveText(now);
  await expect(row).toContainText('20m ago');
  await expect(chat.getByText('Just now')).toHaveCount(0);
});
