import { expect, test, type APIRequestContext } from '@playwright/test';
import {
  chatsWindow,
  chatWindow,
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

  await page.goto('/');
  const row = chatsWindow(page).getByRole('link', { name: new RegExp(name) });
  await expect(row).toBeVisible();
  await expect(row).not.toContainText(/\d+ unread/);

  // Live: each message counts, its preview darkens, the badge follows.
  await say('one');
  await say('two');
  await expect(row).toContainText('two');
  await expect(row).toContainText('2 unread');
  await expect.poll(badge).toBe(await unreadInAll());

  // Read: the count goes, here and on the server.
  await row.click();
  const chat = chatWindow(page, `#${name}`);
  await expect(chat.getByText('two')).toBeVisible();
  await expect(row).not.toContainText(/\d+ unread/);
  await expect.poll(unreadInAll).toBe(await badge());
  await page.reload();
  await expect(row).toBeVisible();
  await expect(row).not.toContainText(/\d+ unread/);

  // Written while it's on screen: read at once.
  await say('three');
  await expect(chat.getByText('three')).toBeVisible();
  await expect(row).toContainText('three');
  await expect(row).not.toContainText(/\d+ unread/);

  // Written once it's closed: counted, and the server agrees.
  await chat.getByRole('button', { name: `Close #${name}` }).click();
  await say('four');
  await expect(row).toContainText('1 unread');
  await page.reload();
  await expect(row).toContainText('1 unread');
  await expect.poll(badge).toBe(await unreadInAll());

  await frank.dispose();
});
