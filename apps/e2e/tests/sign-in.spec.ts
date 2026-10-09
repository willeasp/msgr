import { expect, test } from '@playwright/test';
import { chooseMenu, menuBar, signIn } from './support';

test('Return signs you in after being sent to the login page', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);

  await signIn(page, 'test@example.com');

  await expect(page).toHaveURL(/\/$/);
  await expect(menuBar(page)).toContainText('Test User');
});

test('logging out and in as someone else shows them, not the person before', async ({
  page,
}) => {
  await page.goto('/');
  await signIn(page, 'charlie@example.com');
  await expect(menuBar(page)).toContainText('Charlie Brown');

  await chooseMenu(page, 'File', 'Log Out');
  await expect(page).toHaveURL(/\/login$/);
  await signIn(page, 'diana@example.com');

  await expect(menuBar(page)).toContainText('Diana Prince');
  await expect(menuBar(page)).not.toContainText('Charlie Brown');
});
