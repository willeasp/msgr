import { expect, test, type Page } from '@playwright/test';
import { chatsWindow, chatWindow, SEEDED_PASSWORD } from './support';

/*
 * Sacred's fields draw their own text and insertion point over the browser's
 * field (sacred/components/TextArea.tsx, Input.tsx): editing still works as
 * in any field, the caret and the selection being the browser's own.
 */

async function joinChannel(page: Page, name: string) {
  const response = await page.request.post('/graphql', {
    data: {
      query: 'mutation ($name: String!) { joinChannel(name: $name) { id } }',
      variables: { name },
    },
  });
  const body = (await response.json()) as {
    data?: { joinChannel: { id: string } };
  };
  if (!body.data) throw new Error(JSON.stringify(body));
  return body.data.joinChannel.id;
}

test('the fields edit like any other: in the middle, over a selection, all at once, across lines', async ({
  page,
}) => {
  await page.goto('/login');
  // A slip in the middle of each, put right where it is. Bob has a login to
  // spare under the throttle (ten an email, the whole suite's run).
  const email = page.getByLabel('Email');
  await email.pressSequentially('bobexample.com');
  for (let i = 0; i < 'example.com'.length; i++) await email.press('ArrowLeft');
  await email.press('@');
  await expect(email).toHaveValue('bob@example.com');
  const password = page.getByLabel('Password');
  await password.pressSequentially(SEEDED_PASSWORD.replace('123', '13'));
  await password.press('ArrowLeft');
  await password.press('2');
  await expect(password).toHaveValue(SEEDED_PASSWORD);
  await password.press('Enter');
  await expect(chatsWindow(page)).toBeVisible();

  const name = `fields-${Date.now().toString(36)}`;
  await page.goto(`/${await joinChannel(page, name)}`);
  const chat = chatWindow(page, `#${name}`);
  const composer = chat.getByRole('textbox', { name: 'Message' });
  await composer.click();

  await composer.pressSequentially('Hello world');
  for (let i = 0; i < ' world'.length; i++) await composer.press('ArrowLeft');
  await composer.pressSequentially('XY');
  await expect(composer).toHaveValue('HelloXY world');

  // A selection stays one until it's typed over.
  await composer.press('Shift+ArrowLeft');
  await composer.press('Shift+ArrowLeft');
  await composer.press(',');
  await expect(composer).toHaveValue('Hello, world');
  await composer.press('ControlOrMeta+a');
  await composer.pressSequentially('Bye');
  await expect(composer).toHaveValue('Bye');
  await composer.fill('');
  await expect(composer).toHaveValue('');

  // The field grows with its lines, an empty last one too, and never
  // scrolls inside itself, which would move its text from under the drawn.
  const fits = () =>
    composer.evaluate(
      (field: HTMLTextAreaElement) => field.scrollHeight <= field.clientHeight
    );
  const oneLine = (await composer.boundingBox())?.height ?? 0;
  for (const line of ['One', 'Two', 'Three']) {
    await composer.pressSequentially(line);
    await composer.press('Shift+Enter');
  }
  await expect(composer).toHaveValue('One\nTwo\nThree\n');
  expect(await fits()).toBe(true);
  expect((await composer.boundingBox())?.height).toBeGreaterThanOrEqual(
    oneLine * 3.5
  );
  await composer.press('ControlOrMeta+Home');
  expect(await fits()).toBe(true);

  await composer.press('ControlOrMeta+End');
  await composer.press('Backspace');
  await composer.press('Enter');
  await expect(chat.getByRole('log')).toContainText('Three');
  await expect(composer).toHaveValue('');
});
