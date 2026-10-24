import { expect, test, type Page } from '@playwright/test';
import { anotherPerson, chatWindow, chatsWindow, signIn } from './support';

/** The page hidden and shown again, as a phone's is by its lock or a notification. */
async function setVisibility(page: Page, state: 'visible' | 'hidden') {
  await page.evaluate((state) => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => state,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
}

// A phone covered by its camera or photo picker, or locked, comes back to a
// socket that still says it's open and hears nothing more, nor tells anyone
// so. Here the socket is frozen the same way: nothing goes through, and
// nothing closes it. On a phone the chat list isn't on screen beside a chat.
test('messages sent while the socket was frozen show once the page does, in the chat and the chat list', async ({
  page,
  browser,
}) => {
  const sockets: { frozen: boolean }[] = [];
  const freeze = () => {
    for (const socket of sockets) socket.frozen = true;
  };
  await page.routeWebSocket('/graphql', (client) => {
    const socket = { frozen: false };
    sockets.push(socket);
    const server = client.connectToServer();
    client.onMessage((message) => {
      if (!socket.frozen) server.send(message);
    });
    server.onMessage((message) => {
      if (!socket.frozen) client.send(message);
    });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login');
  await signIn(page, 'alice@example.com');
  await chatsWindow(page).getByText('#general', { exact: true }).click();
  const general = chatWindow(page, '#general');
  await expect(general.getByRole('textbox', { name: 'Message' })).toBeVisible();

  const writer = await anotherPerson(browser);
  await writer.goto('/login');
  await signIn(writer, 'diana@example.com');
  await chatsWindow(writer).getByText('#general', { exact: true }).click();
  const composer = chatWindow(writer, '#general').getByRole('textbox', {
    name: 'Message',
  });
  const send = async (text: string) => {
    await composer.fill(text);
    await composer.press('Enter');
    // Sent: the composer empties once the server has it.
    await expect(composer).toHaveValue('');
  };

  // Shown again after a moment, as when the photo picker closes: with no
  // window reopened, the message arrives.
  freeze();
  await send('Sent while you took a photo');
  await setVisibility(page, 'visible');
  await expect(general.getByText('Sent while you took a photo')).toBeVisible({
    timeout: 15_000,
  });
  expect(sockets.length).toBeGreaterThan(1);

  // And the chat list, which wasn't on screen to hear it, says so too.
  await general.getByRole('button', { name: 'Close #general' }).click();
  await expect(
    chatsWindow(page).getByText('Sent while you took a photo')
  ).toBeVisible();

  // Back after a while away, as from a notification: at once, without
  // waiting to learn that the socket is dead.
  await chatsWindow(page).getByText('#general', { exact: true }).click();
  await expect(general.getByText('Sent while you took a photo')).toBeVisible();
  freeze();
  await setVisibility(page, 'hidden');
  await send('Sent while you were away');
  await page.evaluate(() => {
    const now = Date.now;
    Date.now = () => now() + 60_000;
  });
  await setVisibility(page, 'visible');
  // Sooner than the unanswered ping would start the socket again.
  await expect(general.getByText('Sent while you were away')).toBeVisible({
    timeout: 4_000,
  });
});
