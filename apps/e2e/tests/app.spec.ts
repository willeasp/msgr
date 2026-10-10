import { expect, test } from '@playwright/test';

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
  for (const { src } of [
    ...manifest.icons,
    { src: '/apple-touch-icon.png' },
  ]) {
    expect((await page.request.get(src)).ok(), src).toBe(true);
  }

  const worker = await page.evaluate(
    async () => (await navigator.serviceWorker.ready).active?.scriptURL
  );
  expect(worker).toMatch(/\/sw\.js$/);
});
