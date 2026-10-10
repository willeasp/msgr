import { expect, test, type Browser, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chatWindow, chatsWindow, menuBar, signIn } from '../tests/support';
import { animatedPng } from './animated-png';

/**
 * Remakes the README's pictures in docs/screenshots from the seed data, at
 * twice the pixel density: `npm run screenshots`.
 */

const saveAs = (name: string) =>
  fileURLToPath(new URL(`../../../docs/screenshots/${name}`, import.meta.url));

// Just after the seed's last messages, so they read "36m ago" and not a date.
const NOW = new Date('2024-01-17T09:41:00Z');
const DESKTOP = { width: 1280, height: 800 };
const NARROW = { width: 400, height: 720 };

test.use({ timezoneId: 'UTC', locale: 'en-US', reducedMotion: 'reduce' });

// The tests run in order against one database, so those that add a channel or
// messages come last, after the shots of the untouched seed data.

interface Screen {
  readonly email?: string;
  readonly mode?: 'light' | 'dark';
  readonly tint?: string | null;
  readonly viewport?: { readonly width: number; readonly height: number };
  readonly scale?: number;
}

/** A browser of its own at the seed's morning, signed in if given an email. */
async function screen(
  browser: Browser,
  { email, mode = 'light', tint = null, viewport = DESKTOP, scale = 2 }: Screen
): Promise<Page> {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: scale,
  });
  await context.clock.setFixedTime(NOW);
  await context.addInitScript((theme) => {
    // Also runs in the blank page before the app's, which has no storage.
    if (location.protocol.startsWith('http')) {
      localStorage.setItem('theme', theme);
    }
  }, JSON.stringify({ mode, tint }));
  const page = await context.newPage();
  await page.goto('/login');
  if (email) await signIn(page, email);
  return page;
}

async function openChat(page: Page, title: string, lastLine: string) {
  await chatsWindow(page).getByText(title, { exact: true }).click();
  await expect(chatWindow(page, title).getByText(lastLine)).toBeVisible();
}

async function capture(page: Page, name?: string): Promise<Buffer> {
  await page.evaluate(() => document.fonts.ready);
  return page.screenshot({
    path: name && saveAs(name),
    animations: 'disabled',
  });
}

test('signing in', async ({ browser }) => {
  const page = await screen(browser, {});
  await expect(
    page.getByRole('heading', { name: 'Welcome to Msgr.' })
  ).toBeVisible();
  await capture(page, 'sign-in.png');
});

test('the desktop, light and dark, and as a link preview', async ({
  browser,
}) => {
  const shots: [string, Screen][] = [
    ['desktop-light.png', { mode: 'light' }],
    ['desktop-dark.png', { mode: 'dark' }],
    // GitHub's social preview: 1280×640.
    [
      'social-preview.png',
      { viewport: { width: 1280, height: 640 }, scale: 1 },
    ],
  ];
  for (const [name, options] of shots) {
    const page = await screen(browser, {
      email: 'test@example.com',
      ...options,
    });
    await openChat(page, 'Project Team', 'kickoff meeting tomorrow');
    await capture(page, name);
  }
});

test('themes, from the View menu', async ({ browser }) => {
  const page = await screen(browser, {
    email: 'test@example.com',
    tint: 'blue',
  });
  await openChat(page, '#general', 'Count me in.');
  await menuBar(page)
    .getByRole('button', { name: 'View', exact: true })
    .click();
  await capture(page, 'themes.png');
});

test('on a phone', async ({ browser }) => {
  const page = await screen(browser, {
    email: 'test@example.com',
    mode: 'dark',
    tint: 'orange',
    viewport: { width: 390, height: 780 },
  });
  await openChat(page, 'Alice Johnson', 'Tell me more about them!');
  await capture(page, 'phone.png');
});

test('a drawing, in the paint window', async ({ browser }) => {
  const page = await screen(browser, { email: 'test@example.com' });
  await openChat(page, 'Bob Smith', 'Great work!');
  await chatWindow(page, 'Bob Smith')
    .getByRole('button', { name: 'Draw…' })
    .click();
  const paint = page.getByRole('dialog', { name: 'Drawing for Bob Smith' });
  const canvas = paint.locator('canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('The paint window has no canvas');
  const pick = (name: string) =>
    paint.getByRole('button', { name, exact: true }).click();
  // Points are fractions of the canvas. Strokes start on paper: the pencil
  // draws paper when it starts on ink, as MacPaint's did.
  const drag = async (points: [number, number][]) => {
    const [first, ...rest] = points;
    if (!first) return;
    await canvas.hover({
      position: { x: first[0] * box.width, y: first[1] * box.height },
    });
    await page.mouse.down();
    for (const [x, y] of rest) {
      await page.mouse.move(box.x + x * box.width, box.y + y * box.height, {
        steps: 10,
      });
    }
    await page.mouse.up();
  };
  const pour = async (x: number, y: number) =>
    canvas.click({ position: { x: x * box.width, y: y * box.height } });

  // A house: the roof, the walls, a door; then bricks, tiles and a sun.
  await drag([
    [0.29, 0.5],
    [0.5, 0.16],
    [0.71, 0.5],
    [0.29, 0.5],
  ]);
  await drag([
    [0.35, 0.9],
    [0.35, 0.5],
    [0.65, 0.5],
    [0.65, 0.9],
    [0.35, 0.9],
  ]);
  await drag([
    [0.46, 0.7],
    [0.54, 0.7],
    [0.54, 0.9],
  ]);
  await drag([
    [0.46, 0.71],
    [0.46, 0.9],
  ]);
  await pick('Paint Bucket');
  await pick('Bricks');
  await pour(0.4, 0.8);
  await pick('Dark grey');
  await pour(0.5, 0.4);
  await pick('Black');
  await pour(0.5, 0.8);
  await pick('Brush');
  await drag([
    [0.84, 0.16],
    [0.88, 0.2],
    [0.84, 0.24],
    [0.8, 0.2],
    [0.84, 0.16],
  ]);
  await pick('Paint Bucket');
  await pour(0.84, 0.2);
  await pick('Brush');
  await pick('Grey');
  await drag([
    [0.02, 0.96],
    [0.98, 0.96],
  ]);
  await capture(page, 'paint.png');
});

test('a new channel, and adding people to it', async ({ browser }) => {
  const page = await screen(browser, { email: 'test@example.com' });
  await menuBar(page)
    .getByRole('button', { name: 'File', exact: true })
    .click();
  await page.getByRole('menuitem', { name: 'New Channel' }).click();
  await page.getByLabel('Name').fill('book-club');
  await page.getByLabel('Name').press('Enter');
  await expect(chatWindow(page, '#book-club')).toBeVisible();

  await chatWindow(page, '#book-club')
    .getByRole('button', { name: 'Add People…' })
    .click();
  await page.getByLabel('Find someone to add').fill('li');
  const dialog = page.getByRole('dialog', { name: /Add People/ });
  await dialog.getByText('Alice Johnson', { exact: true }).click();
  await expect(dialog.getByText('In the channel')).toBeVisible();
  await capture(page, 'channel.png');
});

test('two people chatting, live', async ({ browser }) => {
  // Every frame is two screenshots drawn onto a canvas.
  test.setTimeout(120_000);
  const [you, alice] = await Promise.all([
    screen(browser, { email: 'test@example.com', viewport: NARROW }),
    screen(browser, { email: 'alice@example.com', viewport: NARROW }),
  ]);
  await openChat(you, 'Alice Johnson', 'Tell me more about them!');
  await openChat(alice, 'Test User', 'Tell me more about them!');

  const stage = await browser.newPage();
  const frames: { png: Buffer; ms: number }[] = [];
  const frame = async (ms: number) =>
    frames.push({
      png: await sideBySide(stage, await capture(you), await capture(alice)),
      ms,
    });

  const say = async (from: Page, words: string) => {
    // Sacred draws the text and cursor over a hidden textarea: type into it.
    const box = from.getByLabel('Message', { exact: true });
    await box.focus();
    const parts = words.split(' ');
    let typed = '';
    for (const end of new Set([1, Math.ceil(parts.length / 2), parts.length])) {
      const next = parts.slice(0, end).join(' ');
      await from.keyboard.type(next.slice(typed.length));
      typed = next;
      await frame(350);
    }
    await from.keyboard.press('Enter');
    await expect(box).toHaveValue('');
    for (const page of [you, alice]) {
      await expect(page.getByText(words, { exact: true })).toBeVisible();
    }
    await frame(1800);
  };

  await frame(1500);
  await say(you, 'A chat app that looks like a 1984 Macintosh.');
  await say(alice, 'Like this one?');
  await say(you, 'Exactly like this one.');

  const movie = animatedPng(frames);
  // Chromium's own decoder must see every frame, or the file is broken.
  const decoded = await you.evaluate(async (base64) => {
    const data = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const decoder = new ImageDecoder({ data, type: 'image/png' });
    await decoder.tracks.ready;
    return decoder.tracks.selectedTrack?.frameCount;
  }, movie.toString('base64'));
  expect(decoded).toBe(frames.length);
  writeFileSync(saveAs('live.png'), movie);
});

/** Two screens side by side with a clear gap, drawn on a canvas. */
async function sideBySide(stage: Page, left: Buffer, right: Buffer) {
  const url = await stage.evaluate(
    async (sources) => {
      const [a, b] = await Promise.all(
        sources.map(async (source) => {
          const image = new Image();
          image.src = `data:image/png;base64,${source}`;
          await image.decode();
          return image;
        })
      );
      if (!a || !b) throw new Error('Two screens expected');
      const gap = 48;
      const canvas = document.createElement('canvas');
      canvas.width = a.width + gap + b.width;
      canvas.height = Math.max(a.height, b.height);
      const context = canvas.getContext('2d');
      context?.drawImage(a, 0, 0);
      context?.drawImage(b, a.width + gap, 0);
      return canvas.toDataURL('image/png');
    },
    [left.toString('base64'), right.toString('base64')]
  );
  return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
}
