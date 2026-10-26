import { deflateRawSync } from 'node:zlib';
import { byteLength, toBase64 } from '@msgr/media';
import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type Locator,
  type Page,
  type PlaywrightWorkerArgs,
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

/** Joins the channel `name`, starting it if need be, as whoever `page` is: its chat's id. */
export async function joinChannel(page: Page, name: string): Promise<string> {
  const response = await page.request.post('/graphql', {
    data: {
      query: 'mutation ($name: String!) { joinChannel(name: $name) { id } }',
      variables: { name },
    },
  });
  const body = (await response.json()) as {
    data?: { joinChannel: { id: string } };
    errors?: unknown[];
  };
  if (!body.data) throw new Error(JSON.stringify(body.errors ?? body));
  return body.data.joinChannel.id;
}

/** Asks the API as whoever `request` is signed in as; its data, or it throws. */
export async function graphql<T>(
  request: APIRequestContext,
  query: string,
  variables = {}
): Promise<T> {
  const response = await request.post('/graphql', {
    data: { query, variables },
  });
  const body = (await response.json()) as { data?: T; errors?: unknown[] };
  if (!body.data) throw new Error(JSON.stringify(body.errors ?? body));
  return body.data;
}

/** Signs `request` in by the API: one login against the throttle, as any. */
export async function signInAs(request: APIRequestContext, email: string) {
  await graphql(
    request,
    'mutation ($email: String!, $password: String!) { login(email: $email, password: $password) { user { id } } }',
    { email, password: SEEDED_PASSWORD }
  );
}

/**
 * Someone new, signed up by the API with an invite from whoever `inviter`
 * is: another person for a spec that signing up spares the login throttle.
 */
export async function newcomer(
  playwright: PlaywrightWorkerArgs['playwright'],
  inviter: APIRequestContext,
  name: string
): Promise<APIRequestContext> {
  const { createInvite } = await graphql<{ createInvite: { code: string } }>(
    inviter,
    'mutation { createInvite { code } }'
  );
  const request = await playwright.request.newContext({
    baseURL: test.info().project.use.baseURL,
  });
  await graphql(
    request,
    'mutation ($input: SignUpInput!) { signUp(input: $input) { user { id } } }',
    {
      input: {
        inviteCode: createInvite.code,
        name,
        email: `${name.toLowerCase()}-${Date.now().toString(36)}@example.com`,
        password: SEEDED_PASSWORD,
      },
    }
  );
  return request;
}

/** Resolves once the page's feed has asked for messages, so none sent after are missed. */
export const feedListening = (page: Page) =>
  new Promise<void>((resolve) => {
    page.on('websocket', (socket) =>
      socket.on('framesent', ({ payload }) => {
        if (String(payload).includes('OnMessageReceivedForSidebar')) resolve();
      })
    );
  });

/** A page whose live connection (the socket) can be cut, and kept cut, at will. */
export async function liveConnection(page: Page) {
  const connection = { up: true, close: async () => undefined as void };
  await page.routeWebSocket(/\/graphql$/, (socket) => {
    if (!connection.up) return void socket.close({ code: 4000 });
    socket.connectToServer();
    connection.close = () => socket.close({ code: 4000 });
  });
  return {
    async cut() {
      connection.up = false;
      await connection.close();
    },
    restore() {
      connection.up = true;
    },
  };
}

/**
 * A picture as `SendMessageInput.picture` takes it: 160×100, ink on its
 * left half and paper on its right, its rows raw-DEFLATEd as a browser
 * sends them.
 */
export function halfInkPicture() {
  const width = 160;
  const height = 100;
  const row = byteLength(width, 1);
  const bytes = new Uint8Array(row * height);
  for (let y = 0; y < height; y++) bytes.fill(0xff, y * row, y * row + row / 2);
  return { width, height, bits: toBase64(deflateRawSync(bytes)) };
}
