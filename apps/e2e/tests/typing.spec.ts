import { expect, test } from '@playwright/test';
import { anotherPerson, chatWindow, chatsWindow, signIn } from './support';

test('the title bar shows who is typing, with the watch, until they send', async ({
  page,
  browser,
}) => {
  const writer = await anotherPerson(browser);
  await writer.goto('/login');
  await signIn(writer, 'diana@example.com');
  await chatsWindow(writer).getByText('Project Team', { exact: true }).click();
  const composer = chatWindow(writer, 'Project Team').getByRole('textbox', {
    name: 'Message',
  });

  await page.goto('/login');
  await signIn(page, 'test@example.com');
  await chatsWindow(page).getByText('Project Team', { exact: true }).click();
  const status = chatWindow(page, 'Project Team').getByRole('status');
  await expect(status).toHaveText('');

  // Typing says so every few seconds, so a reader who wasn't listening yet
  // hears it at the next.
  await expect(async () => {
    await composer.press('a');
    await expect(status).toHaveText('Diana Prince is typing…', {
      timeout: 1000,
    });
  }).toPass({ intervals: [3000], timeout: 15_000 });
  await expect(status.locator('svg')).toBeVisible();

  await composer.fill('Agenda is up');
  await composer.press('Enter');

  await expect(
    chatWindow(page, 'Project Team').getByText('Agenda is up')
  ).toBeVisible();
  await expect(status).toHaveText('');
});
