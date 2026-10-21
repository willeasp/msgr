import { expect, test, type Locator, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import {
  anotherPerson,
  attach,
  chatsWindow,
  chatWindow,
  signIn,
} from './support';

// Two seconds of a black square sliding right across white, 320×180.
const VIDEO = fileURLToPath(
  new URL('../fixtures/square.webm', import.meta.url)
);

/** Drags across the paint window's canvas, between fractions of its size. */
async function scribble(
  page: Page,
  from: [number, number],
  to: [number, number]
) {
  const canvas = page
    .getByRole('dialog', { name: /^Drawing for / })
    .getByRole('img', { name: 'Canvas' });
  const box = await canvas.boundingBox();
  if (!box) throw new Error('The paint window has no canvas');
  // Hovering waits out the window's zoom-open, which clips the canvas at first.
  await canvas.hover({
    position: { x: from[0] * box.width, y: from[1] * box.height },
  });
  await page.mouse.down();
  await page.mouse.move(box.x + to[0] * box.width, box.y + to[1] * box.height, {
    steps: 12,
  });
  await page.mouse.up();
}

/** Whether the canvas pixel at a fraction of its size is in its ink colour. */
const inked = (canvas: Locator, [x, y]: [number, number]) =>
  canvas.evaluate(
    (element: HTMLCanvasElement, [x, y]) => {
      const probe = document.createElement('canvas').getContext('2d');
      if (!probe) return false;
      probe.fillStyle = getComputedStyle(element).color;
      probe.fillRect(0, 0, 1, 1);
      const at = [
        Math.floor(x * element.width),
        Math.floor(y * element.height),
      ];
      const pixel = (
        context: CanvasRenderingContext2D | null,
        [px, py]: number[]
      ) => Array.from(context?.getImageData(px, py, 1, 1).data ?? []).join();
      return pixel(element.getContext('2d'), at) === pixel(probe, [0, 0]);
    },
    [x, y] as const
  );

test('a video becomes a movie: part of it chosen, drawn on, sent, and looping like a GIF', async ({
  page,
  browser,
}) => {
  const bob = await anotherPerson(browser);
  await page.goto('/login');
  await signIn(page, 'diana@example.com');
  await bob.goto('/login');
  await signIn(bob, 'bob@example.com');
  await chatsWindow(page).getByText('Project Team', { exact: true }).click();
  await chatsWindow(bob).getByText('Project Team', { exact: true }).click();
  const chat = chatWindow(page, 'Project Team');

  const chooser = page.waitForEvent('filechooser');
  await attach(chat, 'Movie…');
  await (await chooser).setFiles(VIDEO);

  // The whole two seconds to start with; the end handle takes half off.
  const trim = page.getByRole('dialog', { name: 'Movie for Project Team' });
  await expect(trim.getByText('2 s of at most 6 s')).toBeVisible();
  await trim.getByRole('slider', { name: 'End' }).press('ArrowLeft');
  await expect(trim.getByText('1.5 s of at most 6 s')).toBeVisible();
  await trim.getByRole('button', { name: 'Make Movie' }).click();
  await expect(trim).toBeHidden({ timeout: 30_000 });

  // Drawn on like a picture, at 320 on its long side, with no bucket to fill.
  await chat.getByRole('button', { name: 'Draw on movie' }).click();
  const paint = page.getByRole('dialog', { name: 'Drawing for Project Team' });
  const canvas = paint.getByRole('img', { name: 'Canvas' });
  await expect(canvas).toHaveAttribute('width', '320');
  await expect(canvas).toHaveAttribute('height', '180');
  await expect(paint.getByRole('button', { name: 'Paint Bucket' })).toHaveCount(
    0
  );
  await paint.getByRole('button', { name: 'Brush' }).click();
  await scribble(page, [0.1, 0.92], [0.9, 0.92]);
  await paint.getByRole('button', { name: 'Attach' }).click();
  await chat.getByRole('button', { name: 'Send', exact: true }).click();

  // Bob's copy loops on its own, nothing to press, the drawing in every frame.
  const movie = chatWindow(bob, 'Project Team')
    .getByRole('img', { name: 'Movie' })
    .last();
  await expect(movie).toHaveAttribute('width', '320');
  await expect(movie).toHaveAttribute('height', '180');
  await expect.poll(() => inked(movie, [0.5, 0.92])).toBe(true);
  const now = await movie.evaluate((c: HTMLCanvasElement) => c.toDataURL());
  await expect
    .poll(() => movie.evaluate((c: HTMLCanvasElement) => c.toDataURL()))
    .not.toBe(now);
  expect(await inked(movie, [0.5, 0.92])).toBe(true);
  await expect(
    chatWindow(bob, 'Project Team').getByRole('button', { name: /pause|play/i })
  ).toHaveCount(0);

  // Without text, the chat list says what it is.
  await expect(
    chatsWindow(bob).getByRole('link', { name: /Project Team/ })
  ).toContainText('Movie');
});

test('a video longer than ten minutes is turned away', async ({ page }) => {
  await page.goto('/login');
  await signIn(page, 'diana@example.com');
  await chatsWindow(page).getByText('Project Team', { exact: true }).click();
  const chat = chatWindow(page, 'Project Team');
  // The browser reads the length from the file; this one says 11 minutes.
  await page.evaluate(() => {
    Object.defineProperty(HTMLMediaElement.prototype, 'duration', {
      get: () => 11 * 60,
    });
  });

  const chooser = page.waitForEvent('filechooser');
  await attach(chat, 'Movie…');
  await (await chooser).setFiles(VIDEO);

  const trim = page.getByRole('dialog', { name: 'Movie for Project Team' });
  await expect(trim.getByRole('alert')).toHaveText(
    'That video is 11:00 long. Choose one of 10 minutes or less.'
  );
  // Sacred shows a button that can't be pressed as its words alone.
  await expect(trim.getByRole('button', { name: 'Make Movie' })).toHaveCount(0);
});
