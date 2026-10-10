import { expect, test, type Browser } from '@playwright/test';
import { chooseMenu, menuBar, signIn } from './support';

/** A browser that has never been offered notifications, nor asked for them. */
async function newDevice(browser: Browser, init?: () => void) {
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  // Headless Chromium says "denied" whatever it's granted; a browser that
  // hasn't asked yet says "default".
  await context.addInitScript(() =>
    Object.defineProperty(Notification, 'permission', { get: () => 'default' })
  );
  if (init) await context.addInitScript(init);
  return context.newPage();
}

test('Msgr offers notifications once on a new device, and remembers Not Now', async ({
  browser,
}) => {
  const page = await newDevice(browser);
  await page.goto('/');
  await signIn(page, 'alice@example.com');

  const offer = page.getByRole('dialog', { name: 'Notifications' });
  await expect(offer).toContainText(
    'Get a notification when a message arrives, even with Msgr closed?'
  );
  await offer.getByRole('button', { name: 'Not Now' }).click();
  await expect(offer).toBeHidden();

  await page.reload();
  // The Notifications item needs the push key, the offer's last ingredient.
  await menuBar(page)
    .getByRole('button', { name: 'Special', exact: true })
    .click();
  await expect(
    page.getByRole('menuitem', { name: 'Notifications' })
  ).toBeVisible();
  await expect(offer).toBeHidden();
});

test('on an iPhone in Safari, the offer says how to install Msgr first', async ({
  browser,
}) => {
  const page = await newDevice(browser, () => {
    // Safari on iOS: no notifications or Web Push outside the Home Screen
    // app, and navigator.standalone is false.
    delete (window as { Notification?: unknown }).Notification;
    delete (window as { PushManager?: unknown }).PushManager;
    Object.defineProperty(Navigator.prototype, 'standalone', {
      get: () => false,
    });
  });
  await page.goto('/');
  await signIn(page, 'bob@example.com');

  const offer = page.getByRole('dialog', { name: 'Notifications' });
  await expect(offer).toContainText('add Msgr to your Home Screen');
  await offer.getByRole('button', { name: 'OK' }).click();
  await expect(offer).toBeHidden();

  await chooseMenu(page, 'Special', 'Notifications…');
  await expect(offer).toContainText('add Msgr to your Home Screen');
});

test('Log Out works where the service worker cannot install', async ({
  browser,
}) => {
  const context = await browser.newContext();
  // Firefox's private windows, for one, refuse service workers.
  await context.addInitScript(() => {
    ServiceWorkerContainer.prototype.register = () =>
      Promise.reject(new Error('Service workers are off'));
  });
  const page = await context.newPage();
  await page.goto('/');
  await signIn(page, 'bob@example.com');

  await chooseMenu(page, 'File', 'Log Out');

  await expect(page).toHaveURL(/\/login$/);
});
