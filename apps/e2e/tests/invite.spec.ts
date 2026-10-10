import { expect, test } from '@playwright/test';
import {
  anotherPerson,
  chatsWindow,
  chatWindow,
  chooseMenu,
  signIn,
} from './support';

const SPENT = 'This invite has been used or has expired.';

test('a used invite link takes whoever joined back to their chats, and tells anyone else', async ({
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

  const stranger = await anotherPerson(browser);
  await stranger.goto(link ?? '');
  await expect(stranger.getByText(SPENT)).toBeVisible();
  await expect(stranger.getByLabel('Name')).toBeHidden();
});

test('a made-up invite link looks spent, and offers a way to sign in', async ({
  page,
}) => {
  await page.goto('/invite/made-up');
  await expect(page.getByText(SPENT)).toBeVisible();

  await page.getByRole('button', { name: 'Sign In' }).click();

  await expect(page).toHaveURL(/\/login$/);
});
