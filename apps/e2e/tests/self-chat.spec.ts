import { expect, test, type APIRequestContext } from '@playwright/test';
import {
  chatWindow,
  chatsWindow,
  chooseMenu,
  newcomer,
  signInAs,
} from './support';

/*
 * A self chat: New Chat's search finds the viewer too, marked (You), and what
 * they write there is theirs alone, never unread. The note-taker is new, signed up
 * by invite, so the spec costs the login throttle one sign-in.
 */

let inviter: APIRequestContext;
let noter: APIRequestContext;
test.beforeAll(async ({ playwright }) => {
  inviter = await playwright.request.newContext({
    baseURL: test.info().project.use.baseURL,
  });
  await signInAs(inviter, 'grace@example.com');
  noter = await newcomer(playwright, inviter, 'Noter');
});
test.afterAll(async () => {
  await noter.dispose();
  await inviter.dispose();
});

test('someone opens a chat with themselves from New Chat and writes in it', async ({
  page,
}) => {
  await page.context().addCookies((await noter.storageState()).cookies);
  await page.goto('/');
  await expect(chatsWindow(page)).toBeVisible();

  await chooseMenu(page, 'File', 'New Chat…');
  const newChat = page.getByRole('dialog', { name: 'New Chat' });
  await newChat.getByLabel('Find someone to message').fill('Noter');
  await newChat.getByText('Noter (You)').click();

  const notes = chatWindow(page, 'Noter');
  await expect(notes).toBeVisible();
  const composer = notes.getByRole('textbox', { name: 'Message' });
  await composer.fill('Buy milk');
  await composer.press('Enter');
  await expect(composer).toHaveValue('');
  const bubble = notes.getByRole('log').getByText('Buy milk');
  await expect(bubble).toBeVisible();
  await expect(notes.getByText('Not Sent.')).toHaveCount(0);

  // Get Info says where it is.
  await bubble.click();
  const info = page.getByRole('dialog', { name: 'Message Info' });
  await expect(info.getByText('Your notes')).toBeVisible();
  await info.getByRole('button', { name: 'OK' }).click();

  // The list has it, and nothing waits unread: they wrote it themselves.
  await page.goto('/');
  const row = chatsWindow(page).getByRole('link', { name: /Noter/ });
  await expect(row).toContainText('Buy milk');
  await expect(row).not.toContainText(/\b1\b/);
});
