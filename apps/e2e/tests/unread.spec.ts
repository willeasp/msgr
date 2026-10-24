import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import {
  chatsWindow,
  chatWindow,
  chooseMenu,
  joinChannel,
  SEEDED_PASSWORD,
  signIn,
} from './support';

async function graphql<T>(
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

/** Resolves once the page's feed has asked for messages, so none sent after are missed. */
const listening = (page: Page) =>
  new Promise<void>((resolve) => {
    page.on('websocket', (socket) =>
      socket.on('framesent', ({ payload }) => {
        if (String(payload).includes('OnMessageReceivedForSidebar')) resolve();
      })
    );
  });

/** "2 unread", not "12 unread". */
const unreadCount = (count: number) => new RegExp(`(^|\\D)${count} unread`);

test('an unread chat counts what it holds, on the list and the app’s badge, until it’s read', async ({
  page,
  playwright,
}) => {
  // The badge the browser would draw on the app's icon.
  await page.addInitScript(() => {
    const shown: number[] = [];
    Object.assign(window, { badges: shown });
    Object.defineProperties(navigator, {
      setAppBadge: {
        value: async (count: number) => void shown.push(count),
      },
      clearAppBadge: { value: async () => void shown.push(0) },
    });
  });
  const badge = () =>
    page.evaluate(
      () => (window as unknown as { badges: number[] }).badges.at(-1) ?? null
    );
  const unreadInAll = async () =>
    (
      await graphql<{ chats: { unreadCount: number }[] }>(
        page.request,
        '{ chats { unreadCount } }'
      )
    ).chats.reduce((sum, chat) => sum + chat.unreadCount, 0);

  await page.goto('/login');
  await signIn(page, 'grace@example.com');
  const name = `counted-${Date.now().toString(36)}`;
  const chatId = await joinChannel(page, name);

  // Frank writes from elsewhere.
  const frank = await playwright.request.newContext({
    baseURL: test.info().project.use.baseURL,
  });
  await graphql(
    frank,
    'mutation ($email: String!, $password: String!) { login(email: $email, password: $password) { user { id } } }',
    { email: 'frank@example.com', password: SEEDED_PASSWORD }
  );
  await graphql(
    frank,
    'mutation ($name: String!) { joinChannel(name: $name) { id } }',
    {
      name,
    }
  );
  const say = (content: string) =>
    graphql(
      frank,
      'mutation ($input: SendMessageInput!) { sendMessage(input: $input) { id } }',
      { input: { chatId, content } }
    );

  let live = listening(page);
  await page.goto('/');
  const row = chatsWindow(page).getByRole('link', { name: new RegExp(name) });
  await expect(row).toBeVisible();
  await expect(row).not.toContainText(/\d+ unread/);
  await live;

  // Live: each message counts, its preview darkens, the badge follows.
  await say('one');
  await say('two');
  await expect(row).toContainText('two');
  await expect(row).toContainText(unreadCount(2));
  await expect.poll(badge).toBe(await unreadInAll());

  // Read: the count goes, here and on the server.
  await row.click();
  const chat = chatWindow(page, `#${name}`);
  await expect(chat.getByText('two')).toBeVisible();
  await expect(row).not.toContainText(/\d+ unread/);
  await expect.poll(unreadInAll).toBe(await badge());
  live = listening(page);
  await page.reload();
  await expect(row).toBeVisible();
  await expect(row).not.toContainText(/\d+ unread/);
  await live;

  // Written while it's on screen: read at once, never counted even for a
  // moment (the row is watched as it changes).
  await row.evaluate((element) => {
    const seen = { counted: false };
    Object.assign(window, { seen });
    new MutationObserver(() => {
      if (/\d+ unread/.test(element.textContent ?? '')) seen.counted = true;
    }).observe(element, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  });
  await say('three');
  await expect(chat.getByText('three')).toBeVisible();
  await expect(row).toContainText('three');
  expect(
    await page.evaluate(
      () => (window as unknown as { seen: { counted: boolean } }).seen.counted
    )
  ).toBe(false);

  // Written once it's closed: counted, and the server agrees.
  await chat.getByRole('button', { name: `Close #${name}` }).click();
  await say('four');
  await expect(row).toContainText(unreadCount(1));
  await page.reload();
  await expect(row).toContainText(unreadCount(1));
  await expect.poll(badge).toBe(await unreadInAll());

  // Opened straight from its address while the list is slow: the list the
  // server counted before this read lands after it, and is read too.
  await page.route('**/graphql', async (route) => {
    const body = route.request().postDataJSON() as {
      operationName?: string;
    } | null;
    if (body?.operationName !== 'GetChats') return route.fallback();
    const response = await route.fetch();
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.fulfill({ response });
  });
  await page.goto(`/${chatId}`);
  await expect(chat.getByText('four')).toBeVisible();
  await expect(row).toBeVisible();
  await expect(row).not.toContainText(/\d+ unread/);
  await expect.poll(unreadInAll).toBe(await badge());
  await page.unroute('**/graphql');

  // Someone else's, once signed out: the badge goes.
  await chooseMenu(page, 'File', 'Log Out');
  await expect(page).toHaveURL(/\/login$/);
  await expect.poll(badge).toBe(0);

  await frank.dispose();
});
