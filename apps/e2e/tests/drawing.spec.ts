import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  anotherPerson,
  attach,
  chatsWindow,
  chatWindow,
  chooseMenu,
  signIn,
} from './support';

const paintWindow = (page: Page) =>
  page.getByRole('dialog', { name: /^Drawing for / });

/** Drags across the paint window's canvas, between fractions of its size. */
async function scribble(
  page: Page,
  from: [number, number],
  to: [number, number]
) {
  const canvas = paintWindow(page).locator('canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('The paint window has no canvas');
  const at = ([x, y]: [number, number]) =>
    [box.x + x * box.width, box.y + y * box.height] as const;
  // Hovering waits out the window's zoom-open, which clips the canvas at first.
  await canvas.hover({
    position: { x: from[0] * box.width, y: from[1] * box.height },
  });
  await page.mouse.down();
  await page.mouse.move(...at(to), { steps: 12 });
  await page.mouse.up();
}

/**
 * Whether the canvas pixel at a fraction of its size is painted in its CSS
 * `color` (ink) or `background-color` (paper).
 */
const painted = (
  canvas: Locator,
  [x, y]: [number, number],
  colour: 'color' | 'backgroundColor'
) =>
  canvas.evaluate(
    (element: HTMLCanvasElement, { x, y, colour }) => {
      const pixel = (
        context: CanvasRenderingContext2D | null,
        at: [number, number]
      ) => Array.from(context?.getImageData(...at, 1, 1).data ?? []).join();
      // Let a canvas turn the CSS colour into pixel values.
      const probe = document.createElement('canvas').getContext('2d');
      if (!probe) return false;
      probe.fillStyle = getComputedStyle(element)[colour];
      probe.fillRect(0, 0, 1, 1);
      const at: [number, number] = [
        Math.floor(x * element.width),
        Math.floor(y * element.height),
      ];
      return pixel(element.getContext('2d'), at) === pixel(probe, [0, 0]);
    },
    { x, y, colour }
  );
const showsPaperAtTopLeft = (canvas: Locator) =>
  painted(canvas, [0, 0], 'backgroundColor');
/** Whether a canvas's paper is lighter than its ink, as on a sheet of paper. */
const darkOnLight = (canvas: Locator) =>
  canvas.evaluate((element) => {
    const light = (colour: string) =>
      (colour.match(/\d+/g) ?? [])
        .slice(0, 3)
        .reduce((sum, value) => sum + Number(value), 0);
    const { color, backgroundColor } = getComputedStyle(element);
    return light(backgroundColor) > light(color);
  });

test('a drawing goes with a message to Bob, live, and comes back drawn on', async ({
  page,
  browser,
}) => {
  const bob = await anotherPerson(browser);
  await page.goto('/login');
  await signIn(page, 'test@example.com');
  await bob.goto('/login');
  await signIn(bob, 'bob@example.com');
  await chatsWindow(page).getByText('Bob Smith', { exact: true }).click();
  await chatsWindow(bob).getByText('Test User', { exact: true }).click();

  await attach(chatWindow(page, 'Bob Smith'), 'Draw…');
  await expect(paintWindow(page)).toHaveAccessibleName('Drawing for Bob Smith');
  await scribble(page, [0.1, 0.2], [0.9, 0.8]);
  await paintWindow(page).getByRole('button', { name: 'Attach' }).click();
  await expect(paintWindow(page)).toBeHidden();

  // Attached, it waits in the composer, and opens again in Paint.
  const composer = chatWindow(page, 'Bob Smith');
  await composer.getByRole('button', { name: 'Edit picture' }).click();
  await expect(paintWindow(page)).toBeVisible();
  await paintWindow(page).getByRole('button', { name: 'Attach' }).click();
  await composer.getByRole('textbox', { name: 'Message' }).fill('look at this');
  await composer.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(
    composer.getByRole('button', { name: 'Edit picture' })
  ).toHaveCount(0);

  const bobsChat = chatWindow(bob, 'Test User');
  const received = bobsChat.getByRole('img', { name: 'Picture' });
  await expect(received).toHaveCount(1);
  await expect(bobsChat.getByText('look at this')).toBeVisible();

  // A picture keeps its tones in every theme, repainted when it changes:
  // on the dark screen, dark is still dark, not a negative.
  expect(await showsPaperAtTopLeft(received)).toBe(true);
  expect(await darkOnLight(received)).toBe(true);
  await chooseMenu(bob, 'View', 'Dark');
  await expect.poll(() => showsPaperAtTopLeft(received)).toBe(true);
  expect(await darkOnLight(received)).toBe(true);

  await bobsChat.getByRole('button', { name: 'Draw on It' }).click();
  await paintWindow(bob).getByRole('button', { name: 'Brush' }).click();
  await paintWindow(bob).getByRole('button', { name: 'Bricks' }).click();
  await scribble(bob, [0.9, 0.1], [0.1, 0.9]);
  await paintWindow(bob).getByRole('button', { name: 'Attach' }).click();
  await bobsChat.getByRole('button', { name: 'Send', exact: true }).click();

  // On its own, with no text: the chat list says what it was.
  await expect(
    chatWindow(page, 'Bob Smith').getByRole('img', { name: 'Picture' })
  ).toHaveCount(2);
  await expect(
    chatsWindow(page).getByText('Picture', { exact: true })
  ).toBeVisible();
});

test('Undo brings back what Clear wiped, and Cancel asks before discarding', async ({
  browser,
}) => {
  const page = await anotherPerson(browser);
  await page.goto('/login');
  await signIn(page, 'charlie@example.com');
  await chatsWindow(page).getByText('Test User', { exact: true }).click();
  await attach(chatWindow(page, 'Test User'), 'Draw…');
  // A blank canvas can't be attached: Attach is only a greyed-out label.
  const send = paintWindow(page).getByRole('button', { name: 'Attach' });
  await expect(send).toHaveCount(0);

  await scribble(page, [0.2, 0.5], [0.8, 0.5]);
  await expect(send).toBeVisible();
  await paintWindow(page).getByRole('button', { name: 'Clear' }).click();
  await expect(send).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(send).toBeVisible();

  await paintWindow(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(paintWindow(page)).toContainText('Discard this drawing?');
  await expect(
    paintWindow(page).getByRole('button', { name: 'Keep Drawing' })
  ).toBeFocused();
  await paintWindow(page).getByRole('button', { name: 'Keep Drawing' }).click();
  await expect(send).toBeVisible();
  await page.keyboard.press('Escape');
  await paintWindow(page).getByRole('button', { name: 'Discard' }).click();
  await expect(paintWindow(page)).toBeHidden();
});

test('a second finger on the canvas does not draw', async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true });
  const page = await context.newPage();
  await page.goto('/login');
  await signIn(page, 'diana@example.com');
  await chatsWindow(page).getByText('Project Team', { exact: true }).click();
  await attach(chatWindow(page, 'Project Team'), 'Draw…');
  const canvas = paintWindow(page).locator('canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('The paint window has no canvas');
  // The zoom-open reveals the canvas from its middle out; wait for the edges.
  await canvas.hover({ position: { x: 0.1 * box.width, y: 0.1 * box.height } });
  const cdp = await context.newCDPSession(page);
  // Without room for more than one touch point, Chromium drops the touches.
  await cdp.send('Emulation.setTouchEmulationEnabled', {
    enabled: true,
    maxTouchPoints: 5,
  });
  const touch = (
    type: 'touchStart' | 'touchMove' | 'touchEnd',
    fingers: [number, number][]
  ) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: fingers.map(([x, y], id) => ({
        x: box.x + x * box.width,
        y: box.y + y * box.height,
        id,
      })),
    });

  // One finger draws down the left side while a second rests on the right.
  await touch('touchStart', [[0.1, 0.1]]);
  await touch('touchStart', [
    [0.1, 0.1],
    [0.9, 0.1],
  ]);
  await touch('touchMove', [
    [0.1, 0.9],
    [0.9, 0.1],
  ]);
  await touch('touchEnd', []);

  expect(await painted(canvas, [0.1, 0.5], 'color')).toBe(true);
  expect(await painted(canvas, [0.5, 0.5], 'color')).toBe(false);
});
