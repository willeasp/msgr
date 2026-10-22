import { expect, test } from '@playwright/test';
import {
  anotherPerson,
  chatWindow,
  chatsWindow,
  chooseMenu,
  menuBar,
  signIn,
} from './support';

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

test('messages keep arriving while the admin looks at storage', async ({
  page,
  browser,
}) => {
  await page.goto('/login');
  await signIn(page, 'diana@example.com');
  await chooseMenu(page, 'Special', 'Storage…');
  await expect(page.getByRole('region', { name: 'Storage' })).toBeVisible();

  const bob = await anotherPerson(browser);
  await bob.goto('/login');
  await signIn(bob, 'bob@example.com');
  await chatsWindow(bob).getByText('#general').click();
  const chat = chatWindow(bob, '#general');
  const composer = chat.getByRole('textbox', { name: 'Message' });
  await composer.fill('Sent while Diana was counting bytes');
  await composer.press('Enter');
  await expect(composer).toHaveValue('');

  // Back on the desktop, without reloading, the list already has it.
  await page.getByRole('button', { name: 'Back to Chats' }).click();
  await expect(
    chatsWindow(page).getByRole('link', { name: /#general/ })
  ).toContainText('Sent while Diana was counting bytes');
});

test("an admin is told when the database can't be measured, and can try again", async ({
  page,
}) => {
  // The first measurement fails, as one might while the database wakes up.
  let failures = 1;
  await page.route('**/graphql', async (route) => {
    const body = route.request().postDataJSON() as {
      operationName?: string;
    } | null;
    if (body?.operationName !== 'Storage' || failures-- <= 0) {
      return route.fallback();
    }
    await route.fulfill({
      json: {
        data: null,
        errors: [{ message: 'Connection timed out', path: ['admin'] }],
      },
    });
  });
  await page.goto('/login');
  await signIn(page, 'diana@example.com');
  await chooseMenu(page, 'Special', 'Storage…');

  const storage = page.getByRole('region', { name: 'Storage' });
  await expect(
    storage.getByText("The database couldn't be measured.")
  ).toBeVisible();
  await expect(storage.getByText('Connection timed out')).toBeVisible();
  await storage.getByRole('button', { name: 'Try Again' }).click();
  await expect(storage.getByText(/used of 512 MB/)).toBeVisible();
});
