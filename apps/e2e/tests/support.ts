import {
  expect,
  type Browser,
  type Locator,
  type Page,
} from '@playwright/test';

/** Every seeded account's password (apps/api/prisma/seed.ts). */
export const SEEDED_PASSWORD = 'password123';

export const menuBar = (page: Page) => page.getByRole('banner');
export const chatsWindow = (page: Page) =>
  page.getByRole('navigation', { name: 'Chats' });
/** A chat's window, found by its title: "Alice Johnson", "#general". */
export const chatWindow = (page: Page, title: string) =>
  page.getByRole('region', { name: title, exact: true });

/** Fills the login form and presses Return, as a person would. */
export async function signIn(page: Page, email: string) {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(SEEDED_PASSWORD);
  await page.getByLabel('Password').press('Enter');
  await expect(chatsWindow(page)).toBeVisible();
}

/** Picks `item` from one of the menu bar's pull-down menus. */
export async function chooseMenu(page: Page, menu: string, item: string) {
  await menuBar(page).getByRole('button', { name: menu, exact: true }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

/** Picks `item` from a chat's Attach menu: "Picture…", "Movie…", "Sound…" or "Draw…". */
export async function attach(chat: Locator, item: string) {
  await chat.getByRole('button', { name: 'Attach', exact: true }).click();
  await chat.page().getByRole('menuitem', { name: item }).click();
}

/** Someone else, in a browser of their own: no shared cookies. */
export async function anotherPerson(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  return context.newPage();
}
