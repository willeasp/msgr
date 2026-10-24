import { expect, test } from '@playwright/test';
import { anotherPerson, chatWindow, chatsWindow, signIn } from './support';

// A phone covered by its camera or photo picker comes back to a socket that
// still says it's open and hears nothing more, nor tells anyone so. Here the
// socket is frozen the same way: nothing goes through, and nothing closes it.
test('a message sent while the socket was frozen shows once the page does', async ({
  page,
  browser,
}) => {
  const sockets: { frozen: boolean }[] = [];
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

  for (const socket of sockets) socket.frozen = true;
  await composer.fill('Sent while you were taking a photo');
  await composer.press('Enter');
  // Sent: the composer empties once the server has it.
  await expect(composer).toHaveValue('');

  // The page shows again, as when the photo picker closes: with no window
  // reopened, the message arrives.
  await page.evaluate(() =>
    document.dispatchEvent(new Event('visibilitychange'))
  );
  await expect(
    general.getByText('Sent while you were taking a photo')
  ).toBeVisible({
    timeout: 15_000,
  });
  expect(sockets.length).toBeGreaterThan(1);
});
