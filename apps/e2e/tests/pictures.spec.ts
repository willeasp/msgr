import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  anotherPerson,
  attach,
  chatsWindow,
  chatWindow,
  signIn,
} from './support';

// A 400×200 photo, `left` on the left and white on the right, drawn in the
// browser so the test needs no files.
const photo = (page: Page, left = '#000') =>
  page.evaluate(async (left) => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 200;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No canvas');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, 400, 200);
    context.fillStyle = left;
    context.fillRect(0, 0, 200, 200);
    const blob = await new Promise<Blob | null>((done) =>
      canvas.toBlob(done, 'image/png')
    );
    if (!blob) throw new Error('No PNG');
    return [...new Uint8Array(await blob.arrayBuffer())];
  }, left);

/** Hands `target` a pasted or dropped file, as the browser would. */
const give = (
  target: Locator,
  how: 'paste' | 'drop',
  bytes: number[],
  type = 'image/png'
) =>
  target.evaluate(
    (node, { how, bytes, type }) => {
      const files = new DataTransfer();
      files.items.add(new File([new Uint8Array(bytes)], 'photo', { type }));
      const init = { bubbles: true, cancelable: true };
      node.dispatchEvent(
        how === 'paste'
          ? new ClipboardEvent('paste', { ...init, clipboardData: files })
          : new DragEvent('drop', { ...init, dataTransfer: files })
      );
    },
    { how, bytes, type }
  );

/** Whether the canvas shows its ink colour at (x, y). */
const inkAt = (canvas: Locator, x: number, y: number) =>
  canvas.evaluate(
    (node: HTMLCanvasElement, [x, y]) => {
      const [r, g, b] =
        node.getContext('2d')?.getImageData(x, y, 1, 1).data ?? [];
      return getComputedStyle(node).color === `rgb(${r}, ${g}, ${b})`;
    },
    [x, y] as const
  );

test('a photo goes with a message, dithered on the way, at its own shape', async ({
  page,
  browser,
}) => {
  const bob = await anotherPerson(browser);
  await page.goto('/login');
  await signIn(page, 'diana@example.com');
  await bob.goto('/login');
  await signIn(bob, 'bob@example.com');
  await chatsWindow(page).getByText('Project Team', { exact: true }).click();
  await chatsWindow(bob).getByText('Project Team', { exact: true }).click();
  const chat = chatWindow(page, 'Project Team');

  const chooser = page.waitForEvent('filechooser');
  await attach(chat, 'Picture…');
  await (
    await chooser
  ).setFiles({
    name: 'coast.png',
    mimeType: 'image/png',
    buffer: Buffer.from(await photo(page)),
  });

  // Shrunk to 320 on its long side, keeping its shape, and paintable.
  await chat.getByRole('button', { name: 'Edit picture' }).click();
  const canvas = page
    .getByRole('dialog', { name: /^Drawing for / })
    .getByRole('img', { name: 'Canvas' });
  await expect(canvas).toHaveAttribute('width', '320');
  await expect(canvas).toHaveAttribute('height', '160');
  await page
    .getByRole('dialog', { name: /^Drawing for / })
    .getByRole('button', { name: 'Attach' })
    .click();

  await chat.getByRole('textbox', { name: 'Message' }).fill('the coast');
  await chat.getByRole('button', { name: 'Send', exact: true }).click();

  const bobsChat = chatWindow(bob, 'Project Team');
  await expect(bobsChat.getByText('the coast')).toBeVisible();
  const received = bobsChat.getByRole('img', { name: 'Picture' }).last();
  await expect(received).toHaveAttribute('width', '320');
  await expect.poll(() => inkAt(received, 40, 80)).toBe(true);
  expect(await inkAt(received, 280, 80)).toBe(false);
});

test('pasting or dropping a photo attaches it; a broken one is refused', async ({
  browser,
}) => {
  const page = await anotherPerson(browser);
  await page.goto('/login');
  await signIn(page, 'alice@example.com');
  await chatsWindow(page).getByText('Test User', { exact: true }).click();
  const chat = chatWindow(page, 'Test User');
  const field = chat.getByRole('textbox', { name: 'Message' });
  const preview = chat.getByRole('button', { name: 'Edit picture' });
  const bytes = await photo(page);

  await give(field, 'paste', bytes);
  await expect(preview).toBeVisible();
  await chat.getByRole('button', { name: 'Remove' }).click();
  await expect(preview).toHaveCount(0);

  await give(chat.getByRole('log', { name: 'Messages' }), 'drop', bytes);
  await expect(preview).toBeVisible();
  await chat.getByRole('button', { name: 'Remove' }).click();

  await give(field, 'paste', [1, 2, 3]);
  await expect(chat.getByRole('alert')).toHaveText(
    'That file isn’t a picture this browser can open.'
  );
  await expect(preview).toHaveCount(0);

  // White on white would arrive blank, which no message may be.
  await give(field, 'paste', await photo(page, '#fff'));
  await expect(chat.getByRole('alert')).toHaveText(
    'That picture comes out blank: nothing in it is dark.'
  );

  // Attaching a drawing instead clears the complaint.
  await attach(chat, 'Draw…');
  await page.getByRole('img', { name: 'Canvas' }).click();
  await page
    .getByRole('dialog', { name: /^Drawing for / })
    .getByRole('button', { name: 'Attach' })
    .click();
  await expect(preview).toBeVisible();
  await expect(chat.getByRole('alert')).toHaveCount(0);
});

test('a picture shows the moment it’s sent, drawn from the device; one the server refuses says Not Sent., and Try Again sends it once', async ({
  browser,
}) => {
  const page = await anotherPerson(browser);
  await page.goto('/login');
  await signIn(page, 'charlie@example.com');
  await chatsWindow(page).getByText('Test User', { exact: true }).click();
  const chat = chatWindow(page, 'Test User');
  const field = chat.getByRole('textbox', { name: 'Message' });
  const preview = chat.getByRole('button', { name: 'Edit picture' });
  const pictures = chat.getByRole('log').getByRole('img', { name: 'Picture' });
  const before = await pictures.count();

  // The server refuses once: the picture is in the history already, saying
  // it wasn't sent, and the composer is free for the next.
  await page.route('**/graphql', (route) =>
    route.request().postDataJSON()?.operationName === 'SendMessage'
      ? route.fulfill({
          json: { errors: [{ message: 'The server is having a moment.' }] },
        })
      : route.fallback()
  );
  await give(field, 'paste', await photo(page));
  await field.fill('once');
  await field.press('Enter');
  await field.press('Enter');
  await expect(pictures).toHaveCount(before + 1);
  const notSent = chat.getByText(/^Not Sent\./);
  await expect(notSent).toBeVisible();
  // Drawn from what's on the device: the server never had it.
  const sent = pictures.last();
  await expect(sent).toHaveAttribute('width', '320');
  await expect.poll(() => inkAt(sent, 40, 80)).toBe(true);
  expect(await inkAt(sent, 280, 80)).toBe(false);
  await expect(preview).toHaveCount(0);
  await expect(field).toHaveValue('');
  await page.unroute('**/graphql');

  const again = chat.getByRole('button', { name: 'Try Again' });
  await again.click();
  await expect(notSent).toHaveCount(0);
  await expect(chat.getByRole('log').getByRole('img', { name: 'Sending' })).toHaveCount(0);
  await expect(pictures).toHaveCount(before + 1);
  await page.waitForTimeout(500);
  await expect(pictures).toHaveCount(before + 1);
  await expect(again).toHaveCount(0);
});
