import { visibleTo } from '../domain/chat.js';
import { firstLink } from '../domain/link.js';
import type { LinkPreview } from '../domain/link-preview.js';
import { MessageId } from '../domain/message.js';
import type { User } from '../domain/user.js';
import type { Loaders } from './loaders.js';
import type { Dependencies } from './ports.js';

export type LinkPreviewService = ReturnType<typeof createLinkPreviewService>;

export function createLinkPreviewService(
  { linkPreviewer }: Dependencies,
  loaders: Loaders
) {
  return {
    /**
     * The card for the first link in a message the viewer can see. Anything
     * else is null, so only links posted to the viewer's own chats are fetched.
     */
    async forMessage(
      viewer: User,
      messageId: string
    ): Promise<LinkPreview | null> {
      const message = await loaders.message.load(MessageId(messageId));
      if (message?.kind !== 'text') return null;
      const chat = visibleTo(
        await loaders.chat.load(message.chatId),
        viewer.id
      );
      if (!chat.ok) return null;
      const url = firstLink(message.content);
      return url ? linkPreviewer.preview(url) : null;
    },
  };
}
