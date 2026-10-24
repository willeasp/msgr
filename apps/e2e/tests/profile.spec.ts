import { expect, test, type Page } from '@playwright/test';
import {
  anotherPerson,
  chatWindow,
  chatsWindow,
  chooseMenu,
  menuBar,
  signIn,
} from './support';

const profile = (page: Page) => page.getByRole('dialog', { name: 'Profile' });
const face = (page: Page) =>
  profile(page).getByRole('img', { name: 'Your face' });

/** A 400×200 photo, dark on the left, made in the browser. */
const photo = (page: Page) =>
  page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 200;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No canvas');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, 400, 200);
    context.fillStyle = '#000';
    context.fillRect(0, 0, 200, 200);
    const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done));
    if (!blob) throw new Error('No PNG');
    return [...new Uint8Array(await blob.arrayBuffer())];
  });

test('a new name and photo reach everyone who shares a chat, live', async ({
  page,
  browser,
}) => {
  const friend = await anotherPerson(browser);
  await friend.goto('/login');
  await signIn(friend, 'test@example.com');
  await chatsWindow(friend).getByText('Charlie Brown', { exact: true }).click();
  const row = chatsWindow(friend).getByRole('link', { name: /Charlie Brown/ });
  await expect(row.locator('[data-picture]')).toHaveCount(0);

  await page.goto('/login');
  await signIn(page, 'charlie@example.com');
  await chooseMenu(page, 'File', 'Profile…');
  await expect(face(page)).not.toHaveAttribute('data-picture');
  const chooser = page.waitForEvent('filechooser');
  await profile(page).getByRole('button', { name: 'Picture…' }).click();
  await (
    await chooser
  ).setFiles({
    name: 'me.png',
    mimeType: 'image/png',
    buffer: Buffer.from(await photo(page)),
  });
  await expect(face(page)).toHaveAttribute('data-picture');
  await profile(page).getByLabel('Name').fill('Chuck');
  await profile(page).getByRole('button', { name: 'Save' }).click();
  await expect(profile(page)).toBeHidden();
  await expect(menuBar(page)).toContainText('Chuck');

  // Without reloading: the row, the title, and Charlie's messages.
  const renamed = chatsWindow(friend).getByRole('link', { name: /Chuck/ });
  await expect(renamed.locator('[data-picture]')).toHaveCount(1);
  const chat = chatWindow(friend, 'Chuck');
  await expect(chat).toBeVisible();
  await expect(chat.locator('img[data-picture]').first()).toBeVisible();

  // Charlie again, for the specs after this one.
  await chooseMenu(page, 'File', 'Profile…');
  await profile(page).getByLabel('Name').fill('Charlie Brown');
  await profile(page).getByRole('button', { name: 'Remove' }).click();
  await profile(page).getByRole('button', { name: 'Save' }).click();
  await expect(menuBar(page)).toContainText('Charlie Brown');
});

test('a drawn face, then the pattern back once it is removed', async ({
  page,
}) => {
  await page.goto('/login');
  await signIn(page, 'bob@example.com');
  await chooseMenu(page, 'File', 'Profile…');

  const paint = page.getByRole('dialog', { name: 'Profile Picture' });
  // Escape closes the paint window only, not the profile under it.
  await profile(page).getByRole('button', { name: 'Draw…' }).click();
  await expect(paint).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(paint).toBeHidden();
  await expect(profile(page)).toBeVisible();

  await profile(page).getByRole('button', { name: 'Draw…' }).click();
  const canvas = paint.getByRole('img', { name: 'Canvas' });
  await expect(canvas).toHaveAttribute('width', '64');
  await expect(canvas).toHaveAttribute('height', '64');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('No canvas');
  // Hovering waits out the window's zoom-open, which clips the canvas at first.
  await canvas.hover({ position: { x: 10, y: 10 } });
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 10, box.y + box.height - 10, {
    steps: 12,
  });
  await page.mouse.up();
  await paint.getByRole('button', { name: 'Use' }).click();
  await expect(paint).toBeHidden();
  await expect(face(page)).toHaveAttribute('data-picture');
  await profile(page).getByRole('button', { name: 'Save' }).click();
  await expect(profile(page)).toBeHidden();

  await chooseMenu(page, 'File', 'Profile…');
  await expect(face(page)).toHaveAttribute('data-picture');
  await profile(page).getByRole('button', { name: 'Remove' }).click();
  await expect(face(page)).not.toHaveAttribute('data-picture');
  await profile(page).getByRole('button', { name: 'Save' }).click();
  await expect(profile(page)).toBeHidden();

  await chooseMenu(page, 'File', 'Profile…');
  await expect(face(page)).not.toHaveAttribute('data-picture');
});

test('others’ faces lead their runs, the viewer’s own none; only chats of more than two name the sender', async ({
  page,
}) => {
  await page.goto('/login');
  await signIn(page, 'alice@example.com');
  const log = (title: string) =>
    chatWindow(page, title).getByRole('log', { name: 'Messages' });

  // In #general others are named above their runs, the viewer never.
  await chatsWindow(page).getByText('#general', { exact: true }).click();
  await expect(log('#general').getByText('Charlie Brown')).toBeVisible();
  await expect(log('#general').getByText('You', { exact: true })).toHaveCount(
    0
  );
  // Faces are others': the viewer's own messages keep to the right without one.
  const own = log('#general').locator('[class*="MessageBubble__own"]');
  await expect(own.getByText('Morning, everyone!')).toBeVisible();
  await expect(own.locator('img')).toHaveCount(0);
  await expect(
    log('#general').locator('[class*="MessageBubble__theirs"] img').first()
  ).toBeVisible();

  // A direct chat needs no names: each run is just a face and its bubbles.
  await chatsWindow(page).getByText('Test User', { exact: true }).click();
  await expect(log('Test User').getByText('Test User')).toHaveCount(0);
  await expect(log('Test User').locator('img').first()).toBeVisible();
});
