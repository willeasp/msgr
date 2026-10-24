import { expect, test } from '@playwright/test';
import { chatWindow, joinChannel, signIn } from './support';

/*
 * Wider than a phone, nothing of a phone's layout (ADR 0013): a chat's window
 * has its close box, and its people and Add People… on the line under its
 * title; nothing says Back, Info or New….
 */
test('a chat’s window keeps its close box and its line of people', async ({
  page,
}) => {
  await page.goto('/login');
  await signIn(page, 'grace@example.com');
  const name = `desktop-${Date.now().toString(36)}`;
  await page.goto(`/${await joinChannel(page, name)}`);
  const chat = chatWindow(page, `#${name}`);
  const close = chat.getByRole('button', { name: `Close #${name}` });
  await expect(close).toBeVisible();
  await expect(chat.getByRole('button', { name: 'Add People…' })).toBeVisible();
  await expect(chat).toContainText('Grace Hall');
  for (const control of ['Back', 'Info', 'New…']) {
    await expect(
      page.getByRole('button', { name: control, exact: true })
    ).toHaveCount(0);
  }

  await close.click();
  await expect(chat).toBeHidden();
});
