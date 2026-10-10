import { expect, test } from '@playwright/test';
import {
  anotherPerson,
  chatsWindow,
  chatWindow,
  chooseMenu,
  signIn,
} from './support';

test('opening your invite link again after joining takes you back to your chats', async ({
  page,
  browser,
}) => {
  await page.goto('/');
  await signIn(page, 'alice@example.com');
  await chooseMenu(page, 'File', 'Invite a Friend…');
  const link = await page.getByText('/invite/').textContent();

  const newcomer = await anotherPerson(browser);
  await newcomer.goto(link ?? '');
  await newcomer.getByLabel('Name').fill('Erin Newcomer');
  await newcomer.getByLabel('Email').fill(`erin-${Date.now()}@example.com`);
  await newcomer.getByLabel('Password').fill('password123');
  await newcomer.getByRole('button', { name: 'Join' }).click();
  await expect(chatWindow(newcomer, 'Alice Johnson')).toBeVisible();

  await newcomer.goto(link ?? '');

  await expect(newcomer).toHaveURL(/\/$/);
  await expect(chatsWindow(newcomer)).toBeVisible();
});

test('the invite page leads someone who already joined to sign in', async ({
  page,
}) => {
  await page.goto('/invite/used-or-not');

  await page.getByRole('link', { name: 'Sign in' }).click();

  await expect(page).toHaveURL(/\/login$/);
});
