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
  // Erin is the e2e server's admin (ADMIN_EMAILS).
  await page.goto('/login');
  await signIn(page, 'erin@example.com');
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
  await signIn(page, 'erin@example.com');
  await chooseMenu(page, 'Special', 'Storage…');
  await expect(page.getByRole('region', { name: 'Storage' })).toBeVisible();

  // Bob writes to Erin for the first time: a chat her list has never seen.
  const bob = await anotherPerson(browser);
  await bob.goto('/login');
  await signIn(bob, 'bob@example.com');
  await chooseMenu(bob, 'File', 'New Chat…');
  await bob.getByLabel('Find someone to message').fill('Erin');
  await bob.getByText('Erin Ellis').click();
  const composer = chatWindow(bob, 'Erin Ellis').getByRole('textbox', {
    name: 'Message',
  });
  await composer.fill('Sent while Erin was counting bytes');
  await composer.press('Enter');
  await expect(composer).toHaveValue('');

  // Back on the desktop, without reloading, the list already has it.
  await page.getByRole('button', { name: 'Back to Chats' }).click();
  await expect(
    chatsWindow(page).getByRole('link', { name: /Bob Smith/ })
  ).toContainText('Sent while Erin was counting bytes');
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
  await signIn(page, 'erin@example.com');
  await chooseMenu(page, 'Special', 'Storage…');

  const storage = page.getByRole('region', { name: 'Storage' });
  await expect(
    storage.getByText("The database couldn't be measured.")
  ).toBeVisible();
  await expect(storage.getByText('Connection timed out')).toBeVisible();
  await storage.getByRole('button', { name: 'Try Again' }).click();
  await expect(storage.getByText(/used of 512 MB/)).toBeVisible();
});

// A real database's report, from a phone where the bars ran off the dialog.
const REPORT = {
  usedBytes: 8.9 * 1024 ** 2,
  limitBytes: 1024 ** 3,
  freeBytes: 1015 * 1024 ** 2,
  contents: [
    ['MOVIE', 8, 496],
    ['PICTURE', 34, 134],
    ['SOUND', 8, 86],
    ['TEXT', 180, 4.3],
    ['AVATAR', 3, 1.5],
  ].map(([kind, count, kb]) => ({
    __typename: 'StoredContent',
    kind,
    count,
    bytes: Math.round(Number(kb) * 1024),
  })),
  tables: [
    ['Message', 1008],
    ['Chat', 96],
    ['Invite', 48],
    ['_ChatParticipants', 48],
    ['User', 48],
    ['PushSubscription', 48],
    ['ReadMark', 48],
    ['_prisma_migrations', 32],
  ].map(([name, kb]) => ({
    __typename: 'TableSize',
    name,
    bytes: Number(kb) * 1024,
  })),
};

// One sign-in for every width: the throttle counts each of the admin's logins.
test('the storage report fits a phone, however narrow', async ({ page }) => {
  await page.route('**/graphql', async (route) => {
    const body = route.request().postDataJSON() as {
      operationName?: string;
    } | null;
    if (body?.operationName !== 'Storage') return route.fallback();
    await route.fulfill({
      json: {
        data: {
          admin: {
            __typename: 'Admin',
            storage: { __typename: 'Storage', ...REPORT },
          },
        },
      },
    });
  });
  await page.goto('/login');
  await signIn(page, 'erin@example.com');
  await page.goto('/admin');
  const storage = page.getByRole('region', { name: 'Storage' });
  await expect(storage.getByText(/^8\.9 MB used of 1/)).toBeVisible();
  // Past its opening zoom, which clips it.
  await expect(storage).toHaveCSS('clip-path', 'none');

  for (const width of [390, 375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    // Every cell, bar included, ends inside the dialog's content: a table
    // could grow past it, so not the table's own edge.
    const overflow = await storage.evaluate((dialog) => {
      const tables = Array.from(dialog.querySelectorAll('table'));
      return tables.flatMap((table) => {
        const edge = (table.parentElement ?? table).getBoundingClientRect()
          .right;
        return Array.from(table.querySelectorAll('th, td'))
          .map((cell) => cell.getBoundingClientRect().right - edge)
          .filter((past) => past > 0.5);
      });
    });
    expect(overflow, `at ${width}px`).toEqual([]);
  }
});
