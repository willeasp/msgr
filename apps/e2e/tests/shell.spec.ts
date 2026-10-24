import { expect, test, type Page } from '@playwright/test';
import { chatsWindow, chooseMenu, menuBar, signIn } from './support';

/*
 * Msgr keeps its own shell on the device (public/sw.js), so it opens with no
 * network at all; and nobody is signed out because the server didn't answer.
 */

/** Signs in, and waits until this version of the shell is kept on the device. */
async function signedInWithShell(page: Page) {
  await page.goto('/login');
  // Erin is in no chat, and has logins to spare under the throttle.
  await signIn(page, 'erin@example.com');
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}

const notice = (page: Page, text: string) =>
  page.getByRole('status').filter({ hasText: text });

test('opens with no network at all, and connects once there is one', async ({
  page,
}) => {
  await signedInWithShell(page);
  await page.context().setOffline(true);

  await page.reload();
  await expect(notice(page, 'No connection')).toBeVisible();
  await expect(page).not.toHaveURL(/\/login$/);

  await page.context().setOffline(false);
  await expect(chatsWindow(page)).toBeVisible({ timeout: 15_000 });
  await expect(menuBar(page)).toContainText('Erin Ellis');
});

test('waits for a server that does not answer, rather than signing you out', async ({
  page,
}) => {
  await signedInWithShell(page);
  // Requests that pass through the shell are the context's to route.
  await page
    .context()
    .route('**/graphql', (route) => route.abort('connectionrefused'));

  await page.reload();
  await expect(notice(page, 'Connecting to Msgr…')).toBeVisible();
  await expect(page).not.toHaveURL(/\/login$/);

  await page.context().unroute('**/graphql');
  await expect(chatsWindow(page)).toBeVisible({ timeout: 15_000 });
});

test("the browser's bars take the theme's paper, as a colour every phone reads", async ({
  page,
}) => {
  await page.goto('/login');
  const themeColour = () =>
    page
      .locator('meta[name="theme-color"]')
      .getAttribute('content')
      .then((colour) => colour ?? '');
  /** The page's paper, drawn as the browser draws it. */
  const paper = () =>
    page.evaluate(() => {
      const pen = document.createElement('canvas').getContext('2d');
      if (!pen) return 'no canvas';
      pen.fillStyle = getComputedStyle(document.body).backgroundColor;
      pen.fillRect(0, 0, 1, 1);
      const [r, g, b] = pen.getImageData(0, 0, 1, 1).data;
      return `#${[r, g, b]
        .map((n) => (n ?? 0).toString(16).padStart(2, '0'))
        .join('')}`;
    });

  await chooseMenu(page, 'View', 'Light');
  const light = await themeColour();
  expect(light).toBe('#ffffff');

  await chooseMenu(page, 'View', 'Dark');
  const dark = await themeColour();
  expect(dark).toBe(await paper());
  expect(dark).not.toBe(light);

  // A tint's paper is worked out in CSS, as `oklch(from …)`.
  await chooseMenu(page, 'View', 'Green Tint');
  const green = await themeColour();
  expect(green).toMatch(/^#[0-9a-f]{6}$/);
  expect(green).toBe(await paper());
  expect(green).not.toBe(dark);

  // And so from the first paint.
  await page.reload();
  expect(await themeColour()).toBe(green);
});

test('a server that answers with an error can be left for the login page', async ({
  page,
}) => {
  await signedInWithShell(page);
  await page.context().route('**/graphql', (route) =>
    route.request().postDataJSON()?.operationName === 'GetMe'
      ? route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            errors: [{ message: 'Something went wrong' }],
          }),
        })
      : route.continue()
  );

  await page.reload();
  await expect(notice(page, 'Msgr couldn’t open')).toBeVisible();
  await page.getByRole('button', { name: 'Sign In Again…' }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.context().unroute('**/graphql');
  await signIn(page, 'erin@example.com');
  await expect(chatsWindow(page)).toBeVisible();
});

test('a dialog opens with no network, though it loads only when needed', async ({
  page,
}) => {
  await signedInWithShell(page);
  await page.context().setOffline(true);

  await chooseMenu(page, 'File', 'Profile…');
  await expect(page.getByRole('dialog', { name: 'Profile' })).toBeVisible();
});

test('a dialog that can no longer be fetched says so, and offers a reload', async ({
  browser,
}) => {
  // A page the shell doesn't keep, after a deploy replaced what it would load.
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.route(/\/assets\/ProfileDialog-[^/]+\.js$/, (route) =>
    route.fulfill({ status: 404 })
  );
  const page = await context.newPage();
  await page.goto('/login');
  await signIn(page, 'erin@example.com');

  await chooseMenu(page, 'File', 'Profile…');
  const failed = page.getByRole('dialog', { name: 'Msgr' });
  await expect(failed).toContainText('This couldn’t be opened.');
  await expect(failed.getByRole('button', { name: 'Reload' })).toBeVisible();
  await failed.getByRole('button', { name: 'Cancel' }).click();
  await expect(failed).toBeHidden();
  // The rest of the app carries on; Escape closes it too, as any dialog.
  await expect(chatsWindow(page)).toBeVisible();
  await chooseMenu(page, 'File', 'Profile…');
  await expect(failed).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(failed).toBeHidden();
  await context.close();
});

test('a page the shell does not keep fetches a dialog only to open it, and its Escape stays its own', async ({
  browser,
}) => {
  // A first visit on a slow network: nothing is on the device yet. A fetch
  // made early and failed would stay failed for the page, so none is made.
  const context = await browser.newContext({ serviceWorkers: 'block' });
  let asked = 0;
  let release = () => undefined as void;
  const held = new Promise<void>((done) => (release = done));
  await context.route(/\/assets\/ProfileDialog-[^/]+\.js$/, async (route) => {
    asked += 1;
    await held;
    await route.continue();
  });
  const page = await context.newPage();
  await page.goto('/login');
  await signIn(page, 'diana@example.com');
  await page.waitForTimeout(1000);
  expect(asked).toBe(0);

  // Profile, still coming, under New Chat (⌃K) opened over it meanwhile.
  await chooseMenu(page, 'File', 'Profile…');
  await page.keyboard.press('Control+k');
  const newChat = page.getByRole('dialog', { name: 'New Chat' });
  await expect(newChat).toBeVisible();
  release();
  const profile = page.getByRole('dialog', { name: 'Profile' });
  await expect(profile).toBeAttached();
  expect(asked).toBe(1);

  // One Escape closes the dialog on top, the next the one it opened over.
  await page.keyboard.press('Escape');
  await expect(newChat).toBeHidden();
  await expect(profile).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(profile).toBeHidden();
  await context.close();
});
