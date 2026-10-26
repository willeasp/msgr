import {
  expect,
  test,
  type APIRequestContext,
  type Locator,
  type Page,
} from '@playwright/test';
import { byteLength, encodeMovie, toBase64 } from '@msgr/media';
import {
  chatWindow,
  feedListening,
  graphql,
  halfInkPicture,
  joinChannel,
  newcomer,
  signInAs,
} from './support';

/*
 * A picture or movie in a message opens full screen when it's clicked: in a
 * window of its own on the desktop's pattern, as large as fits. A click
 * anywhere, its close box or Escape closes it. Everyone here but the
 * inviter is new, so the specs cost the login throttle one sign-in in all.
 */

let inviter: APIRequestContext;
const people: APIRequestContext[] = [];
test.beforeAll(async ({ playwright }) => {
  inviter = await playwright.request.newContext({
    baseURL: test.info().project.use.baseURL,
  });
  await signInAs(inviter, 'grace@example.com');
});
test.afterEach(async () => {
  await Promise.all(people.splice(0).map((person) => person.dispose()));
});
test.afterAll(() => inviter.dispose());

const SEND =
  'mutation ($input: SendMessageInput!) { sendMessage(input: $input) { id } }';

/** 80×60, a square sliding across in 8 frames: every frame differs. */
function movie() {
  const width = 80;
  const height = 60;
  const count = 8;
  const size = byteLength(width, height);
  const row = byteLength(width, 1);
  const bytes = new Uint8Array(size * count);
  for (let f = 0; f < count; f++) {
    for (let y = 20; y < 40; y++) {
      for (let x = f * 8; x < f * 8 + 16; x++) {
        bytes[f * size + y * row + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
  }
  return {
    width,
    height,
    frames: count,
    bits: toBase64(encodeMovie({ width, height, count, bytes })),
  };
}

/** A channel of the page's own, open, with someone else's picture in it and the viewer's movie. */
async function chat(page: Page, playwright: Parameters<typeof newcomer>[0]) {
  const viewer = await newcomer(playwright, inviter, 'Viewer');
  const ana = await newcomer(playwright, inviter, 'Ana');
  people.push(viewer, ana);
  await page.context().addCookies((await viewer.storageState()).cookies);
  const name = `full-${Date.now().toString(36)}`;
  const chatId = await joinChannel(page, name);
  await graphql(
    ana,
    'mutation ($name: String!) { joinChannel(name: $name) { id } }',
    {
      name,
    }
  );
  await graphql(ana, SEND, {
    input: { chatId, picture: halfInkPicture(), content: 'The coast' },
  });
  await graphql(viewer, SEND, { input: { chatId, movie: movie() } });
  const listening = feedListening(page);
  await page.goto(`/${chatId}`);
  const window = chatWindow(page, `#${name}`);
  await expect(window).toBeVisible();
  await listening;
  const log = window.getByRole('log');
  await expect(log.getByRole('img', { name: 'Picture' })).toBeVisible();
  return { window, log };
}

/** Whether the canvas shows its ink at (x, y) of its own pixels. */
const inkAt = (canvas: Locator, x: number, y: number) =>
  canvas.evaluate(
    (node: HTMLCanvasElement, [x, y]) => {
      const [r, g, b] =
        node.getContext('2d')?.getImageData(x, y, 1, 1).data ?? [];
      return getComputedStyle(node).color === `rgb(${r}, ${g}, ${b})`;
    },
    [x, y] as const
  );

const box = async (locator: Locator) => {
  const found = await locator.boundingBox();
  if (!found) throw new Error(`${locator} has no box`);
  return found;
};

test('a picture opens full screen in a window of its own, as large as fits, and a click anywhere closes it', async ({
  page,
  playwright,
}) => {
  const { log } = await chat(page, playwright);
  const inChat = log.getByRole('img', { name: 'Picture' });
  const full = page.getByRole('dialog', { name: 'Ana’s Picture' });
  const shown = full.getByRole('img', { name: 'Picture' });

  await inChat.click();
  await expect(full).toBeVisible();
  await expect(shown).toBeVisible();
  // As large as fits the desktop, its pixels whole: the screen is 1280×720.
  const size = await box(shown);
  expect(size.width).toBeGreaterThan((await box(inChat)).width * 1.5);
  expect(size.width % 160).toBe(0);
  expect(size.width / size.height).toBeCloseTo(1.6, 2);
  const viewport = page.viewportSize();
  expect(size.y + size.height).toBeLessThanOrEqual(viewport?.height ?? 0);
  expect(await inkAt(shown, 5, 50)).toBe(true);
  expect(await inkAt(shown, 120, 50)).toBe(false);

  // A click anywhere closes it, the picture's own included, and the
  // keyboard goes back to the picture.
  await shown.click();
  await expect(full).toHaveCount(0);
  const opener = log.getByRole('button', { name: 'Show Picture Full Screen' });
  await expect(opener).toBeFocused();

  // By the keyboard: open, and Escape.
  await page.keyboard.press('Enter');
  await expect(full).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(full).toHaveCount(0);

  // On the desktop around the window.
  await opener.click();
  await page.mouse.click(5, 5);
  await expect(full).toHaveCount(0);

  // A click on the words opens Get Info, as ever, and nothing full screen.
  await log.getByText('The coast').click();
  await expect(
    page.getByRole('dialog', { name: 'Message Info' })
  ).toBeVisible();
  await expect(full).toHaveCount(0);
});

test('a movie opens full screen, still looping, and its close box closes it', async ({
  page,
  playwright,
}) => {
  const { log } = await chat(page, playwright);
  const full = page.getByRole('dialog', { name: 'Your Movie' });
  const shown = full.getByRole('img', { name: 'Movie' });

  await log.getByRole('img', { name: 'Movie' }).click();
  await expect(shown).toBeVisible();
  // The square slides: what's at its first place changes.
  await expect
    .poll(async () => [await inkAt(shown, 4, 30), await inkAt(shown, 60, 30)])
    .toEqual([false, true]);
  await expect
    .poll(async () => [await inkAt(shown, 4, 30), await inkAt(shown, 60, 30)])
    .toEqual([true, false]);

  await full.getByRole('button', { name: 'Close Your Movie' }).click();
  await expect(full).toHaveCount(0);
  await expect(log).toBeVisible();
});
