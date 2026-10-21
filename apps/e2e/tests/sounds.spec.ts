import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import {
  anotherPerson,
  attach,
  chatsWindow,
  chatWindow,
  signIn,
} from './support';

// Two seconds of a 440 Hz beep.
const BEEP = fileURLToPath(new URL('../fixtures/beep.wav', import.meta.url));

test('a file becomes a sound: part of it chosen, heard squashed, sent and played', async ({
  page,
  browser,
}) => {
  const test = await anotherPerson(browser);
  await page.goto('/login');
  await signIn(page, 'charlie@example.com');
  await test.goto('/login');
  await signIn(test, 'test@example.com');
  await chatsWindow(page).getByText('Test User', { exact: true }).click();
  await chatsWindow(test).getByText('Charlie Brown', { exact: true }).click();
  const chat = chatWindow(page, 'Test User');

  await attach(chat, 'Sound…');
  const dialog = page.getByRole('dialog', { name: 'Sound for Test User' });
  const chooser = page.waitForEvent('filechooser');
  await dialog.getByRole('button', { name: 'Choose File…' }).click();
  await (await chooser).setFiles(BEEP);

  // The whole two seconds to start with; the end handle takes half off.
  await expect(dialog.getByText('2 s of at most 60 s')).toBeVisible();
  await dialog.getByRole('slider', { name: 'End' }).press('ArrowLeft');
  await expect(dialog.getByText('1.5 s of at most 60 s')).toBeVisible();

  // Play plays it squashed, as it will be sent, until it ends or is stopped.
  await dialog.getByRole('button', { name: 'Play' }).click();
  await expect(dialog.getByRole('button', { name: 'Stop' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Stop' }).click();
  await dialog.getByRole('button', { name: 'Make Sound' }).click();
  await expect(dialog).toBeHidden();

  const attached = chat.getByRole('group', { name: 'Attached sound' });
  await expect(attached).toContainText('0:01');
  await chat.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(attached).toBeHidden();

  // Test's copy plays, its time counting, and stops by itself.
  const sound = chatWindow(test, 'Charlie Brown')
    .getByRole('group', { name: 'Sound' })
    .last();
  await expect(sound).toContainText('0:01');
  await sound.getByRole('button', { name: 'Play sound' }).click();
  await expect(sound.getByRole('button', { name: 'Stop sound' })).toBeVisible();
  await expect(sound.getByRole('button', { name: 'Play sound' })).toBeVisible({
    timeout: 5_000,
  });
  // Playing is not a click on the message: Get Info stays shut.
  await expect(test.getByRole('dialog', { name: 'Message Info' })).toHaveCount(
    0
  );

  // Without text, the chat list says what it is.
  await expect(
    chatsWindow(test).getByRole('link', { name: /Charlie Brown/ })
  ).toContainText('Sound');
});

test('a sound is recorded from the microphone', async ({ browser }) => {
  // Chromium's pretend microphone beeps (playwright.config.ts).
  const context = await browser.newContext({ permissions: ['microphone'] });
  const page = await context.newPage();
  await page.goto('/login');
  await signIn(page, 'alice@example.com');
  await chatsWindow(page).getByText('Test User', { exact: true }).click();
  const chat = chatWindow(page, 'Test User');

  await attach(chat, 'Sound…');
  const dialog = page.getByRole('dialog', { name: 'Sound for Test User' });
  await dialog.getByRole('button', { name: 'Record' }).click();
  await expect(dialog.getByText(/Recording… 0:0[2-9]/)).toBeVisible({
    timeout: 10_000,
  });
  await dialog.getByRole('button', { name: 'Stop' }).click();

  await expect(dialog.getByText(/ s of at most 60 s/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Make Sound' }).click();
  await expect(dialog).toBeHidden();
  await chat.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(chat.getByRole('group', { name: 'Sound' }).last()).toBeVisible();
  await context.close();
});

test('a file that is not a sound is turned away', async ({ page }) => {
  await page.goto('/login');
  await signIn(page, 'alice@example.com');
  await chatsWindow(page).getByText('Test User', { exact: true }).click();
  const chat = chatWindow(page, 'Test User');

  await attach(chat, 'Sound…');
  const dialog = page.getByRole('dialog', { name: 'Sound for Test User' });
  const chooser = page.waitForEvent('filechooser');
  await dialog.getByRole('button', { name: 'Choose File…' }).click();
  await (
    await chooser
  ).setFiles({
    name: 'song.mp3',
    mimeType: 'audio/mpeg',
    buffer: Buffer.from('not really a song'),
  });

  await expect(dialog.getByRole('alert')).toHaveText(
    'This browser can’t play that file.'
  );
  // Sacred shows a button that can't be pressed as its words alone.
  await expect(dialog.getByRole('button', { name: 'Make Sound' })).toHaveCount(
    0
  );
});
