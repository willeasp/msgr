import { expect, test } from '@playwright/test';
import { anotherPerson, chatWindow, chatsWindow, signIn } from './support';

test('Get Info on a message says who has read it, and when', async ({
  page,
  browser,
}) => {
  await page.goto('/login');
  await signIn(page, 'alice@example.com');
  await chatsWindow(page).getByText('Test User', { exact: true }).click();
  const chat = chatWindow(page, 'Test User');
  const composer = chat.getByRole('textbox', { name: 'Message' });
  await composer.fill('Did the slides come through?');
  await composer.press('Enter');
  const bubble = chat
    .getByRole('log', { name: 'Messages' })
    .getByText('Did the slides come through?');
  await expect(bubble).toBeVisible();

  // A click on the message opens it.
  await bubble.click();
  const info = page.getByRole('dialog', { name: 'Message Info' });
  await expect(info.getByText('“Did the slides come through?”')).toBeVisible();
  await expect(info.getByText('Text', { exact: true })).toBeVisible();
  await expect(info.getByText('Your chat with Test User')).toBeVisible();
  const readers = info.getByRole('region', { name: 'Read by' });
  await expect(readers.getByRole('listitem')).toHaveText(/Test User\s*Not yet/);
  await info.getByRole('button', { name: 'OK' }).click();
  await expect(info).toBeHidden();

  // Test User opens the chat, and so reads it.
  const reader = await anotherPerson(browser);
  await reader.goto('/login');
  await signIn(reader, 'test@example.com');
  const marked = reader.waitForResponse((response) =>
    (response.request().postData() ?? '').includes('MarkRead')
  );
  await chatsWindow(reader).getByText('Alice Johnson', { exact: true }).click();
  await expect(
    chatWindow(reader, 'Alice Johnson').getByText(
      'Did the slides come through?'
    )
  ).toBeVisible();
  await marked;

  await bubble.click();
  await expect(readers.getByRole('listitem')).toHaveText(
    /Test User\s*Today, \d/
  );
});
