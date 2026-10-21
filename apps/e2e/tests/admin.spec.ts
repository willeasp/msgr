import { expect, test } from '@playwright/test';
import { anotherPerson, chooseMenu, menuBar, signIn } from './support';

test('an admin sees how full the database is, and nobody else finds the page', async ({
  page,
  browser,
}) => {
  // Diana is the e2e server's admin (ADMIN_EMAILS).
  await page.goto('/login');
  await signIn(page, 'diana@example.com');
  await chooseMenu(page, 'Special', 'Storage…');
  await expect(page).toHaveURL(/\/admin$/);
  const storage = page.getByRole('region', { name: 'Storage' });
  await expect(storage.getByText(/used of 512 MB/)).toBeVisible();
  await expect(storage.getByText(/ left$/)).toBeVisible();
  await expect(
    storage.getByRole('rowheader', { name: 'Text', exact: true })
  ).toBeVisible();
  await expect(
    storage.getByRole('rowheader', { name: 'Message', exact: true })
  ).toBeVisible();
  await storage.getByRole('button', { name: 'Back to Chats' }).click();
  await expect(page).toHaveURL(/\/$/);

  // Anyone else: no menu item, and the address is as empty as any other.
  const other = await anotherPerson(browser);
  await other.goto('/login');
  await signIn(other, 'charlie@example.com');
  await menuBar(other)
    .getByRole('button', { name: 'Special', exact: true })
    .click();
  await expect(
    other.getByRole('menuitem', { name: 'Alert Sound' })
  ).toBeVisible();
  await expect(other.getByRole('menuitem', { name: 'Storage…' })).toBeHidden();
  await other.keyboard.press('Escape');
  await other.goto('/admin');
  await expect(other.getByText('Nothing lives at this address.')).toBeVisible();
});
