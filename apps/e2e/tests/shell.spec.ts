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

test("the browser's bars take the theme's paper", async ({ page }) => {
  await page.goto('/login');
  /** The theme colour, and the page's paper, both as the browser computes them. */
  const colours = async () => ({
    theme: await page.evaluate(() => {
      const probe = document.createElement('i');
      probe.style.color =
        document
          .querySelector('meta[name="theme-color"]')
          ?.getAttribute('content') ?? '';
      document.body.append(probe);
      const colour = getComputedStyle(probe).color;
      probe.remove();
      return colour;
    }),
    paper: await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor
    ),
  });

  await chooseMenu(page, 'View', 'Light');
  const light = await colours();
  expect(light.theme).toBe(light.paper);

  await chooseMenu(page, 'View', 'Dark');
  const dark = await colours();
  expect(dark.theme).toBe(dark.paper);
  expect(dark.theme).not.toBe(light.theme);
});
