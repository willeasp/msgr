import { expect, test, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { byteLength, encodeMovie, toBase64, type Frames } from '@msgr/media';
import { countRenders, rendersDuring, type Renders } from '../tests/renders';
import {
  anotherPerson,
  chatWindow,
  chatsWindow,
  signIn,
} from '../tests/support';

/*
 * What the app costs while it's used, measured in the production build:
 * what React renders for each thing that happens, and the main thread's time,
 * the layout and the memory it takes. `npm run measure` prints the results
 * (and writes them to MEASURE_OUT, if set), to compare a change against main.
 */

const VIEWER = 'test@example.com';
const WRITER = 'charlie@example.com';
const CHAT = 'Charlie Brown';
const LOG = '[role="log"]';

/** A square sliding across a dithered field: every frame differs. */
function movie(width: number, height: number, count: number): Frames {
  const row = byteLength(width, 1);
  const bytes = new Uint8Array(byteLength(width, height) * count);
  for (let f = 0; f < count; f++) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const square =
          x >= f * 4 && x < f * 4 + 30 && y >= 20 && y < 50 ? 1 : 0;
        const ink = square || (x + y) % 7 === 0 ? 1 : 0;
        if (ink) {
          bytes[f * row * height + y * row + (x >> 3)] |= 0x80 >> (x & 7);
        }
      }
    }
  }
  return { width, height, count, bytes };
}

async function graphql(page: Page, query: string, variables = {}) {
  const response = await page.request.post('/graphql', {
    data: { query, variables },
  });
  const body = (await response.json()) as {
    data?: Record<string, unknown>;
    errors?: unknown[];
  };
  if (body.errors) throw new Error(JSON.stringify(body.errors));
  return body.data ?? {};
}

/** The main thread's time and the page's memory, from Chromium itself. */
async function metrics(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const read = async () => {
    const { metrics } = (await cdp.send('Performance.getMetrics')) as {
      metrics: { name: string; value: number }[];
    };
    return Object.fromEntries(metrics.map(({ name, value }) => [name, value]));
  };
  return {
    /** Milliseconds of script, layout and style, and the rest, while `action` runs. */
    async during(action: () => Promise<unknown>) {
      const before = await read();
      await action();
      const after = await read();
      const ms = (name: string) =>
        Math.round(((after[name] ?? 0) - (before[name] ?? 0)) * 1000 * 10) / 10;
      return {
        task: ms('TaskDuration'),
        script: ms('ScriptDuration'),
        layout: ms('LayoutDuration'),
        style: ms('RecalcStyleDuration'),
        layouts: (after['LayoutCount'] ?? 0) - (before['LayoutCount'] ?? 0),
      };
    },
    async heap() {
      await cdp.send('HeapProfiler.collectGarbage');
      const now = await read();
      return {
        heapMB: Math.round(((now['JSHeapUsedSize'] ?? 0) / 2 ** 20) * 10) / 10,
        nodes: now['Nodes'] ?? 0,
      };
    },
  };
}

const summary = (renders: Renders) => ({
  total: renders.total,
  inHistory: renders.inside,
  commits: renders.commits,
  top: Object.entries(renders.byLabel)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8),
});

test('what using a chat costs', async ({ page, browser }) => {
  test.setTimeout(180_000);
  const results: Record<string, unknown> = {};

  // A history a page long, six movies in it, sent by someone else.
  const writer = await anotherPerson(browser);
  await writer.goto('/login');
  await signIn(writer, WRITER);
  const { chats } = (await graphql(
    writer,
    '{ chats { id counterpart { name } } }'
  )) as { chats: { id: string; counterpart: { name: string } | null }[] };
  const chatId = chats.find((c) => c.counterpart?.name === 'Test User')?.id;
  if (!chatId) throw new Error('no chat with Test User');
  const send = `mutation ($input: SendMessageInput!) { sendMessage(input: $input) { id } }`;
  const frames = movie(160, 120, 24);
  const wire = {
    width: frames.width,
    height: frames.height,
    frames: frames.count,
    bits: toBase64(encodeMovie(frames)),
  };
  for (let i = 0; i < 44; i++) {
    await graphql(writer, send, {
      input: {
        chatId,
        content: `Line ${i}: a few words to wrap, and a 😀`,
      },
    });
    if (i % 8 === 3) {
      await graphql(writer, send, { input: { chatId, movie: wire } });
    }
  }

  await countRenders(page);
  await page.goto('/login');
  await signIn(page, VIEWER);
  const cost = await metrics(page);
  const chat = chatWindow(page, CHAT);

  // Opening the app again, from the shell on the device, to the desktop.
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  const started = Date.now();
  results['reload'] = {
    ...(await cost.during(async () => {
      await page.reload();
      await expect(chatsWindow(page).getByText(CHAT)).toBeVisible();
    })),
    wallMs: Date.now() - started,
  };

  // Opening the chat: its history, its movies starting to loop.
  results['openChat'] = await cost.during(async () => {
    await chatsWindow(page).getByText(CHAT, { exact: true }).click();
    await expect(chat.locator(LOG).getByText('Line 43:')).toBeVisible();
  });
  await page.waitForTimeout(2000);
  results['heapWithChatOpen'] = await cost.heap();

  // Five seconds of doing nothing, with whatever movies are on screen looping.
  results['idle5s'] = await cost.during(() => page.waitForTimeout(5000));

  // Someone else typing, then their message arriving.
  const theirComposer = chatWindow(writer, 'Test User').getByRole('textbox', {
    name: 'Message',
  });
  await chatsWindow(writer).getByText('Test User', { exact: true }).click();
  const status = chat.getByRole('status', { name: 'Typing' });
  results['typingNotice'] = summary(
    await rendersDuring(page, LOG, async () => {
      await expect(async () => {
        await theirComposer.press('a');
        await expect(status).toHaveText(/typing/, { timeout: 1000 });
      }).toPass({ intervals: [3000], timeout: 15_000 });
    })
  );
  results['messageArrives'] = summary(
    await rendersDuring(page, LOG, async () => {
      await theirComposer.fill('One more thing');
      await theirComposer.press('Enter');
      await expect(chat.locator(LOG).getByText('One more thing')).toBeVisible();
    })
  );

  // The clock moving on: every "5m ago".
  results['clockTick'] = summary(
    await rendersDuring(page, LOG, () =>
      page.evaluate(() => window.dispatchEvent(new Event('focus')))
    )
  );

  // Get Info on a message, and closing it.
  results['getInfo'] = summary(
    await rendersDuring(page, LOG, async () => {
      await chat.locator(LOG).getByText('Line 40:').click();
      await expect(page.getByLabel('Message Info')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByLabel('Message Info')).toBeHidden();
    })
  );

  // The viewer writing 40 characters.
  const composer = chat.getByRole('textbox', { name: 'Message' });
  await composer.click();
  const text = 'The quick brown fox jumps over the lazy d';
  let typed: Renders | undefined;
  const typing = await cost.during(async () => {
    typed = await rendersDuring(page, LOG, () =>
      composer.pressSequentially(text, { delay: 20 })
    );
  });
  results['typing40'] = {
    ...typing,
    perKeyMs: Math.round((typing.task / text.length) * 100) / 100,
    renders: typed && summary(typed),
  };

  // Sending it: shown at once, then stored (ADR 0016).
  results['messageSent'] = summary(
    await rendersDuring(page, LOG, async () => {
      await composer.press('Enter');
      const log = chat.locator(LOG);
      await expect(log.getByText(text)).toBeVisible();
      await expect(log.getByRole('img', { name: 'Sending' })).toHaveCount(0);
    })
  );

  // A stroke across the paint window: 120 moves of the pointer.
  await composer.fill('');
  await chat.getByRole('button', { name: 'Attach', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Draw…' }).click();
  const paint = page.getByRole('dialog', { name: /^Drawing for / });
  const canvas = paint.locator('canvas');
  await canvas.hover({ position: { x: 10, y: 10 } });
  const box = await canvas.boundingBox();
  if (!box) throw new Error('The paint window has no canvas');
  results['stroke120'] = await cost.during(async () => {
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 10, box.y + box.height - 10, {
      steps: 120,
    });
    await page.mouse.up();
    await page.waitForTimeout(100);
  });

  results['heapAtEnd'] = await cost.heap();

  const out = JSON.stringify(results, null, 2);
  console.log(out);
  if (process.env['MEASURE_OUT'])
    writeFileSync(process.env['MEASURE_OUT'], out);
});
