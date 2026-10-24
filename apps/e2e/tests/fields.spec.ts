import { expect, test, type Locator } from '@playwright/test';
import {
  chatsWindow,
  chatWindow,
  joinChannel,
  SEEDED_PASSWORD,
  signIn,
} from './support';

/*
 * Sacred's fields draw their own text, insertion point and selection over
 * the browser's field (sacred/components/TextArea.tsx, Input.tsx): editing
 * works as in any field, and what's drawn always matches the field.
 * Frank (in the seed for this) has logins to spare under the throttle.
 */

const FRANK = 'frank@example.com';

/**
 * Whether the drawn copy shows what the field holds: its text, `|` where the
 * insertion point is, `[…]` a selection. Polled, as the browser tells of a
 * selection's change a moment after it.
 */
async function expectInStep(field: Locator) {
  await expect
    .poll(() =>
      field.evaluate((el: HTMLInputElement | HTMLTextAreaElement) => {
        const copy =
          el instanceof HTMLInputElement
            ? el.previousElementSibling
            : el.parentElement?.firstElementChild;
        const mask = (text: string) =>
          el.type === 'password' ? '•'.repeat(text.length) : text;
        const start = el.selectionStart ?? el.value.length;
        const end = el.selectionEnd ?? start;
        const held =
          mask(el.value.slice(0, start)) +
          (start === end ? '|' : `[${mask(el.value.slice(start, end))}]`) +
          mask(el.value.slice(end));
        const drawn = (node: Node): string => {
          const name = node instanceof HTMLElement ? node.className : '';
          if (name.includes('__block')) return '|';
          if (name.includes('__selection')) return `[${node.textContent}]`;
          if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
          return Array.from(node.childNodes, drawn).join('');
        };
        // Less the empty last line's zero-width space.
        const shown = (copy ? drawn(copy) : '').replace(/\u200b$/, '');
        return shown === held ? 'in step' : { held, shown };
      })
    )
    .toBe('in step');
}

test('the login form edits like any other, and shows a long address as it scrolls', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 760 });
  await page.goto('/login');
  const email = page.getByLabel('Email');

  // Longer than the field: the drawn copy scrolls with it, and on as far as
  // its insertion point, a block wider than the browser's caret, needs.
  await email.pressSequentially('firstname.lastname@company-domain.example');
  await expectInStep(email);
  const scrolled = await email.evaluate((el: HTMLInputElement) => {
    const copy = el.previousElementSibling as HTMLElement;
    const block = copy.querySelector('[class*="__block"]') as HTMLElement;
    const { right, width } = block.getBoundingClientRect();
    return {
      field: el.scrollLeft,
      past: copy.scrollLeft - el.scrollLeft,
      block: Math.ceil(width),
      blockInView: right <= copy.getBoundingClientRect().right + 0.5,
    };
  });
  expect(scrolled.field).toBeGreaterThan(0);
  expect(scrolled.past).toBeGreaterThanOrEqual(0);
  expect(scrolled.past).toBeLessThanOrEqual(scrolled.block);
  expect(scrolled.blockInView).toBe(true);

  // A slip in the middle of each, put right where it is.
  await email.fill('');
  await email.pressSequentially('frankexample.com');
  for (let i = 0; i < 'example.com'.length; i++) await email.press('ArrowLeft');
  await expectInStep(email);
  await email.press('@');
  await expect(email).toHaveValue(FRANK);
  await expectInStep(email);
  const password = page.getByLabel('Password');
  await password.pressSequentially(SEEDED_PASSWORD.replace('123', '13'));
  await password.press('ArrowLeft');
  await password.press('2');
  await expect(password).toHaveValue(SEEDED_PASSWORD);
  await expectInStep(password);
  await password.press('ControlOrMeta+a');
  await expectInStep(password);
  await password.press('Enter');
  await expect(chatsWindow(page)).toBeVisible();
});

test('the message field edits like any other: in the middle, over a selection, all at once, across lines', async ({
  page,
}) => {
  await page.goto('/login');
  await signIn(page, FRANK);
  const name = `fields-${Date.now().toString(36)}`;
  await page.goto(`/${await joinChannel(page, name)}`);
  const chat = chatWindow(page, `#${name}`);
  const composer = chat.getByRole('textbox', { name: 'Message' });
  await composer.click();

  await composer.pressSequentially('Hello world');
  for (let i = 0; i < ' world'.length; i++) await composer.press('ArrowLeft');
  await composer.pressSequentially('XY');
  await expect(composer).toHaveValue('HelloXY world');
  await expectInStep(composer);

  // A selection stays one until it's typed over, however it's made.
  await composer.press('Shift+ArrowLeft');
  await composer.press('Shift+ArrowLeft');
  await expectInStep(composer);
  await composer.press(',');
  await expect(composer).toHaveValue('Hello, world');
  // As a menu's Select All or a phone's does: no key, no click.
  await composer.evaluate(() => document.execCommand('selectAll'));
  await expectInStep(composer);
  // Partway through dragging over it.
  const box = await composer.boundingBox();
  if (!box) throw new Error('The message field has no box');
  await page.mouse.move(box.x + 4, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 40, box.y + box.height / 2, { steps: 4 });
  await expectInStep(composer);
  await page.mouse.up();
  await composer.press('ControlOrMeta+a');
  await composer.pressSequentially('Bye');
  await expect(composer).toHaveValue('Bye');
  await composer.fill('');
  await expect(composer).toHaveValue('');

  // The field grows with its lines, an empty last one too.
  const oneLine = (await composer.boundingBox())?.height ?? 0;
  for (const line of ['One', 'Two', 'Three']) {
    await composer.pressSequentially(line);
    await composer.press('Shift+Enter');
  }
  await expect(composer).toHaveValue('One\nTwo\nThree\n');
  expect((await composer.boundingBox())?.height).toBeGreaterThanOrEqual(
    oneLine * 3.5
  );
  await expectInStep(composer);

  // Wherever the insertion point is, the field never scrolls inside itself,
  // which would move its text from under the drawn copy. The hard case: a
  // word that just doesn't fit at a line's end, the insertion point inside
  // it, where the copy mustn't break it as the field doesn't.
  const overflowing = await composer.evaluate(
    async (field: HTMLTextAreaElement) => {
      // The browser's selectionchange, then React's render: tasks, not frames.
      const task = () => new Promise((done) => setTimeout(done));
      // As typing would, past React's own record of the value.
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value'
      )?.set;
      const type = async (text: string) => {
        setValue?.call(field, text);
        field.dispatchEvent(new Event('input', { bubbles: true }));
        await task();
        await task();
      };
      // How many characters a line holds: one word, until it wraps.
      await type('x');
      const line = field.scrollHeight;
      let columns = 1;
      while (columns < 400) {
        await type('x'.repeat(columns + 1));
        if (field.scrollHeight > line) break;
        columns++;
      }
      const at: string[] = [];
      for (const [n, between] of [
        ...[-2, -1, 0, 1, 2].map((d) => [columns + d, ' '] as const),
        ...[-1, 0, 1].map((d) => [columns + d, '-'] as const),
      ]) {
        await type(
          `${'a'.repeat(n - 10)}${between}${'b'.repeat(12)} ${'c'.repeat(
            n - 14
          )} ddddd`
        );
        for (let caret = n - 9; caret <= n + 3; caret++) {
          field.setSelectionRange(caret, caret);
          await task();
          await task();
          if (field.scrollHeight > field.clientHeight) {
            at.push(`${n}${between}${caret}`);
          }
        }
      }
      return at;
    }
  );
  expect(overflowing).toEqual([]);

  // In forced colours the field's own text stays hidden under the copy, whose
  // insertion point shows in the system's colours.
  await composer.fill('Contrast');
  await page.emulateMedia({ forcedColors: 'active' });
  const colours = await composer.evaluate((field: HTMLTextAreaElement) => {
    const copy = field.parentElement?.firstElementChild as HTMLElement;
    const block = copy.querySelector('[class*="__block"]') as HTMLElement;
    return {
      field: getComputedStyle(field).color,
      block: getComputedStyle(block).backgroundColor,
      paper: getComputedStyle(copy).color,
    };
  });
  expect(colours.field).toBe('rgba(0, 0, 0, 0)');
  expect(colours.block).toBe(colours.paper);
  await page.emulateMedia({ forcedColors: 'none' });

  await composer.fill('One\nTwo\nThree');
  await composer.press('Enter');
  await expect(chat.getByRole('log')).toContainText('Three');
  await expect(composer).toHaveValue('');
});
