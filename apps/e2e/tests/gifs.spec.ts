import {
  expect,
  test,
  type APIRequestContext,
  type Locator,
  type Page,
} from '@playwright/test';
import {
  attach,
  chatWindow,
  fakeGif,
  fakeGiphy,
  feedListening,
  graphql,
  newcomer,
  signInAs,
  type GifSearch,
} from './support';

/*
 * Attach → GIF… finds a GIF on GIPHY, through the server, and makes it a
 * movie on the device, in black and white, as Movie… does from a video.
 * GIPHY itself is faked (support.ts's fakeGiphy). Everyone here but the
 * inviter is new, so the specs cost the login throttle one sign-in in all.
 */

let inviter: APIRequestContext;
const people: APIRequestContext[] = [];
test.beforeAll(async ({ playwright }) => {
  inviter = await playwright.request.newContext({
    baseURL: test.info().project.use.baseURL,
  });
  await signInAs(inviter, 'frank@example.com');
});
test.afterEach(async () => {
  await Promise.all(people.splice(0).map((person) => person.dispose()));
});
test.afterAll(() => inviter.dispose());

/** Someone new, in their chat with Frank, who invited them. */
async function chat(page: Page, playwright: Parameters<typeof newcomer>[0]) {
  const viewer = await newcomer(playwright, inviter, 'Viewer');
  people.push(viewer);
  await page.context().addCookies((await viewer.storageState()).cookies);
  // Their only chat, with Frank, who invited them.
  const { chats } = await graphql<{ chats: { id: string }[] }>(
    viewer,
    '{ chats { id } }'
  );
  const listening = feedListening(page);
  await page.goto(`/${chats[0]?.id}`);
  const window = chatWindow(page, 'Frank Moss');
  await expect(window).toBeVisible();
  await listening;
  return window;
}

/** A page of GIPHY's: `count` GIFs named after `name`, from `from`. */
const page = (
  name: string,
  from: number,
  count: number,
  next: string | null
) => ({
  data: {
    gifs: {
      __typename: 'GifPage',
      gifs: Array.from({ length: count }, (_, i) =>
        fakeGif(`${name.toLowerCase()}${from + i}`, `${name} ${from + i}`)
      ),
      next,
    },
  },
});

/** Trending, and Wave over two pages; nothing else. */
const giphy = ({ search, after }: GifSearch) =>
  !search
    ? page('Trending', 0, 24, '24')
    : search === 'wave'
    ? after
      ? page('Wave', 24, 4, null)
      : page('Wave', 0, 24, '24')
    : page('None', 0, 0, null);

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

/** Whether every pixel of the canvas is its ink or its paper: black and white. */
const oneBit = (canvas: Locator) =>
  canvas.evaluate((node: HTMLCanvasElement) => {
    const probe = document.createElement('canvas').getContext('2d');
    const context = node.getContext('2d');
    if (!probe || !context) return false;
    const { color, backgroundColor } = getComputedStyle(node);
    const colours = [color, backgroundColor].map((css) => {
      probe.fillStyle = css;
      probe.fillRect(0, 0, 1, 1);
      return Array.from(probe.getImageData(0, 0, 1, 1).data).join();
    });
    const { data } = context.getImageData(0, 0, node.width, node.height);
    for (let i = 0; i < data.length; i += 4) {
      if (!colours.includes(Array.from(data.subarray(i, i + 4)).join())) {
        return false;
      }
    }
    return true;
  });

test('a GIF found on GIPHY becomes a black-and-white movie, attached and sent', async ({
  page: viewer,
  playwright,
}) => {
  const searches = await fakeGiphy(viewer, giphy);
  const window = await chat(viewer, playwright);

  await attach(window, 'GIF…');
  const dialog = viewer.getByRole('dialog', { name: 'GIF for Frank Moss' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Powered by GIPHY')).toBeVisible();

  // What's trending, each still dithered here: ink and paper only, its
  // middle square at 64 pixels, the black half on the left.
  const trending = dialog.getByRole('group', { name: 'Trending GIFs' });
  await expect(trending.getByRole('button')).toHaveCount(25);
  const still = trending
    .getByRole('button', { name: 'Trending 0', exact: true })
    .locator('canvas');
  await expect.poll(() => inkAt(still, 10, 32)).toBe(true);
  expect(await inkAt(still, 54, 32)).toBe(false);
  expect(await oneBit(still)).toBe(true);
  expect(await still.evaluate((node: HTMLCanvasElement) => node.width)).toBe(
    64
  );

  // Searched once typing pauses, not for every letter.
  const field = dialog.getByLabel('Search');
  await expect(field).toBeFocused();
  await field.pressSequentially('wave', { delay: 60 });
  const waves = dialog.getByRole('group', { name: 'GIFs for wave' });
  await expect(waves.getByRole('button', { name: /^Wave / })).toHaveCount(24);
  // More, and no more after the last page.
  await waves.getByRole('button', { name: 'More GIFs' }).click();
  await expect(waves.getByRole('button', { name: /^Wave / })).toHaveCount(28);
  await expect(waves.getByRole('button', { name: 'More GIFs' })).toHaveCount(0);
  expect(searches).toEqual([
    { search: null },
    { search: 'wave' },
    { search: 'wave', after: '24' },
  ]);

  // Chosen: made a movie on this device, the dialog closes, it's attached.
  await waves.getByRole('button', { name: 'Wave 26', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const attached = window
    .getByRole('button', { name: 'Draw on movie' })
    .locator('canvas');
  await expect(attached).toBeVisible();
  expect(await attached.evaluate((node: HTMLCanvasElement) => node.width)).toBe(
    320
  );

  // Sent, it loops in the history as any movie does: the square slides.
  await window.getByRole('button', { name: 'Send', exact: true }).click();
  const movie = window.getByRole('log').getByRole('img', { name: 'Movie' });
  await expect(movie).toBeVisible();
  const square = async () => [
    await inkAt(movie, 40, 90),
    await inkAt(movie, 265, 90),
  ];
  await expect.poll(square, { intervals: [20] }).toEqual([true, false]);
  await expect.poll(square, { intervals: [20] }).toEqual([false, true]);
});

test('says when GIPHY can’t answer or finds nothing, and making a movie can be stopped', async ({
  page: viewer,
  playwright,
}) => {
  let busy = true;
  let release = () => undefined as void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await fakeGiphy(
    viewer,
    (search) =>
      busy
        ? {
            data: { gifs: null },
            errors: [
              {
                message:
                  'GIPHY has had all the searches it allows this hour. Try again later.',
                extensions: { code: 'SERVICE_UNAVAILABLE' },
                path: ['gifs'],
              },
            ],
          }
        : giphy(search),
    { hold: held }
  );
  const window = await chat(viewer, playwright);
  await attach(window, 'GIF…');
  const dialog = viewer.getByRole('dialog', { name: 'GIF for Frank Moss' });

  await expect(dialog.getByRole('alert')).toHaveText(
    /GIPHY has had all the searches it allows this hour/
  );
  busy = false;
  await dialog.getByRole('button', { name: 'Try Again' }).click();
  await expect(
    dialog.getByRole('button', { name: 'Trending 3', exact: true })
  ).toBeVisible();

  await dialog.getByLabel('Search').fill('zzz');
  await expect(dialog.getByText('No GIFs for “zzz”.')).toBeVisible();
  await dialog.getByLabel('Search').fill('');

  // While its movie is fetched, Stop (or Escape) stops; the GIFs stay.
  await dialog.getByRole('button', { name: 'Trending 3', exact: true }).click();
  await expect(dialog.getByText('Fetching the GIF…')).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Trending 4', exact: true })
  ).toBeDisabled();
  await dialog.getByRole('button', { name: 'Stop' }).click();
  await expect(dialog.getByText('Fetching the GIF…')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Trending 4', exact: true }).click();
  await expect(dialog.getByText('Fetching the GIF…')).toBeVisible();
  await viewer.keyboard.press('Escape');
  await expect(dialog.getByText('Fetching the GIF…')).toHaveCount(0);
  await expect(dialog).toBeVisible();
  release();
  await viewer.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(
    window.getByRole('button', { name: 'Draw on movie' })
  ).toHaveCount(0);
});

test('GIF… isn’t offered while the server has no key for GIPHY', async ({
  page: viewer,
  playwright,
}) => {
  await viewer.route('**/graphql', async (route) => {
    const body = route.request().postDataJSON() as {
      operationName?: string;
    } | null;
    if (body?.operationName !== 'GetMe') return route.fallback();
    const response = await route.fetch();
    const json = (await response.json()) as { data: { gifsOn: boolean } };
    json.data.gifsOn = false;
    await route.fulfill({ response, json });
  });
  const window = await chat(viewer, playwright);

  await window.getByRole('button', { name: 'Attach', exact: true }).click();
  await expect(viewer.getByRole('menuitem', { name: 'Draw…' })).toBeVisible();
  await expect(viewer.getByRole('menuitem', { name: 'GIF…' })).toHaveCount(0);
});
