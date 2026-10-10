import { expect, test } from '@playwright/test';
import { chooseMenu, menuBar, signIn } from './support';

test('Msgr installs as an app, with a service worker for notifications', async ({
  page,
}) => {
  await page.goto('/login');

  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifest = await (await page.request.get(href ?? '')).json();
  expect(manifest).toMatchObject({
    name: 'Msgr',
    display: 'standalone',
    start_url: '/',
  });
  for (const { src } of [...manifest.icons, { src: '/apple-touch-icon.png' }]) {
    expect((await page.request.get(src)).ok(), src).toBe(true);
  }

  const worker = await page.evaluate(
    async () => (await navigator.serviceWorker.ready).active?.scriptURL
  );
  expect(worker).toMatch(/\/sw\.js$/);
});

test('Special → Install Msgr… appears when the browser offers to install it', async ({
  page,
}) => {
  await page.goto('/');
  await signIn(page, 'alice@example.com');
  await menuBar(page)
    .getByRole('button', { name: 'Special', exact: true })
    .click();
  await expect(
    page.getByRole('menuitem', { name: 'Install Msgr…' })
  ).toHaveCount(0);
  await page.keyboard.press('Escape');

  // Chrome fires this after a click and about 30 seconds on the page.
  await page.evaluate(() => {
    const offer = Object.assign(new Event('beforeinstallprompt'), {
      prompt: async () => {
        (window as unknown as { prompted: boolean }).prompted = true;
      },
    });
    window.dispatchEvent(offer);
  });
  await chooseMenu(page, 'Special', 'Install Msgr…');

  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { prompted?: boolean }).prompted
      )
    )
    .toBe(true);
});
