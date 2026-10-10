import { describe, expect, it, vi } from 'vitest';
import type { LinkPreviewer } from './ports.js';
import { Drawing } from '../domain/drawing.js';
import type { LinkPreview, Thumbnail } from '../domain/link-preview.js';
import type { Url } from '../domain/link.js';
import { createTestApp, expectOk } from '../testing/harness.js';

const preview: LinkPreview = {
  url: 'https://a.com/x' as Url,
  site: 'A',
  title: 'The page at A',
  description: null,
  thumbnail: null as Thumbnail | null,
};

async function world() {
  const linkPreviewer: LinkPreviewer = {
    preview: vi.fn(async (url) => (url === preview.url ? preview : null)),
  };
  const app = createTestApp({ linkPreviewer });
  const ada = await app.fixtures.user({ name: 'Ada' });
  const linus = await app.fixtures.user({ name: 'Linus' });
  const chat = await app.fixtures.groupChat('Notes', [ada]);
  const say = async (content: string) =>
    expectOk(
      await app.services().messages.send(ada, { chatId: chat.id, content })
    ).id;
  return { ...app, linkPreviewer, ada, linus, chat, say };
}

describe('link previews', () => {
  it('previews the first link in a message the viewer can see', async () => {
    const { services, ada, say } = await world();
    const id = await say('look https://a.com/x! and https://b.com');

    expect(await services().linkPreviews.forMessage(ada, id)).toEqual(preview);
  });

  it('answers null without fetching for anyone outside the chat, for drawings, for text without links and for unknown ids', async () => {
    const { services, linkPreviewer, ada, linus, chat, say } = await world();
    const withLink = await say('https://a.com/x');
    const plain = await say('no links here');
    const bytes = new Uint8Array(Drawing.BYTES).fill(1);
    const drawing = expectOk(
      await services().messages.sendDrawing(ada, {
        chatId: chat.id,
        drawing: btoa(String.fromCharCode(...bytes)),
      })
    ).id;

    for (const [viewer, id] of [
      [linus, withLink],
      [ada, plain],
      [ada, drawing],
      [ada, 'missing'],
    ] as const) {
      expect(await services().linkPreviews.forMessage(viewer, id)).toBeNull();
    }
    expect(linkPreviewer.preview).not.toHaveBeenCalled();
  });
});
