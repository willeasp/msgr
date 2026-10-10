import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  anotherPerson,
  chatWindow,
  chatsWindow,
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

/** Whether the canvas's top-left pixel is painted in its CSS background colour. */
const showsPaperAtTopLeft = (canvas: Locator) =>
  canvas.evaluate((element: HTMLCanvasElement) => {
    const pixel = (context: CanvasRenderingContext2D | null) =>
      Array.from(context?.getImageData(0, 0, 1, 1).data ?? []).join();
    // Let a canvas turn the CSS colour into pixel values.
    const probe = document.createElement('canvas').getContext('2d');
    if (!probe) return false;
    probe.fillStyle = getComputedStyle(element).backgroundColor;
    probe.fillRect(0, 0, 1, 1);
    return pixel(element.getContext('2d')) === pixel(probe);
  });

test('a drawing reaches Bob live, and comes back drawn on', async ({
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

  await chatWindow(page, 'Bob Smith')
    .getByRole('button', { name: 'Draw…' })
    .click();
  await expect(paintWindow(page)).toHaveAccessibleName('Drawing for Bob Smith');
  await scribble(page, [0.1, 0.2], [0.9, 0.8]);
  await paintWindow(page).getByRole('button', { name: 'Send' }).click();
  await expect(paintWindow(page)).toBeHidden();

  const bobsChat = chatWindow(bob, 'Test User');
  const received = bobsChat.getByRole('img', { name: 'Drawing' });
  await expect(received).toHaveCount(1);
  await expect(
    chatsWindow(bob).getByText('Drawing', { exact: true })
  ).toBeVisible();

  // The picture follows the theme, repainted in the dark paper.
  expect(await showsPaperAtTopLeft(received)).toBe(true);
  await chooseMenu(bob, 'View', 'Dark');
  await expect.poll(() => showsPaperAtTopLeft(received)).toBe(true);

  await bobsChat.getByRole('button', { name: 'Draw on It' }).click();
  await paintWindow(bob).getByRole('button', { name: 'Brush' }).click();
  await paintWindow(bob).getByRole('button', { name: 'Bricks' }).click();
  await scribble(bob, [0.9, 0.1], [0.1, 0.9]);
  await paintWindow(bob).getByRole('button', { name: 'Send' }).click();

  await expect(
    chatWindow(page, 'Bob Smith').getByRole('img', { name: 'Drawing' })
  ).toHaveCount(2);
});

test('Undo brings back what Clear wiped, and Cancel asks before discarding', async ({
  browser,
}) => {
  const page = await anotherPerson(browser);
  await page.goto('/login');
  await signIn(page, 'charlie@example.com');
  await chatsWindow(page).getByText('Test User', { exact: true }).click();
  await chatWindow(page, 'Test User')
    .getByRole('button', { name: 'Draw…' })
    .click();
  // A blank canvas can't be sent: Send is only a greyed-out label.
  const send = paintWindow(page).getByRole('button', { name: 'Send' });
  await expect(send).toHaveCount(0);

  await scribble(page, [0.2, 0.5], [0.8, 0.5]);
  await expect(send).toBeVisible();
  await paintWindow(page).getByRole('button', { name: 'Clear' }).click();
  await expect(send).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(send).toBeVisible();

  await paintWindow(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(paintWindow(page)).toContainText('Discard this drawing?');
  await paintWindow(page).getByRole('button', { name: 'Keep Drawing' }).click();
  await expect(send).toBeVisible();
  await page.keyboard.press('Escape');
  await paintWindow(page).getByRole('button', { name: 'Discard' }).click();
  await expect(paintWindow(page)).toBeHidden();
});
