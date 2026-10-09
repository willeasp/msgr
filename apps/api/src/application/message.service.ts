import { ChatId, visibleTo } from '../domain/chat.js';
import type { InvalidInput, NotFound } from '../domain/errors.js';
import { MessageContent, type Message } from '../domain/message.js';
import { Page } from '../domain/page.js';
import { ok, type Result } from '../domain/result.js';
import type { User } from '../domain/user.js';
import type { Loaders } from './loaders.js';
import type { Dependencies } from './ports.js';

export type MessageService = ReturnType<typeof createMessageService>;

export function createMessageService(
  { repositories, events, clock }: Dependencies,
  loaders: Loaders
) {
  return {
    async list(
      viewer: User,
      input: {
        readonly chatId: string;
        readonly limit?: number | null;
        readonly offset?: number | null;
      }
    ): Promise<Result<Message[], InvalidInput | NotFound>> {
      const page = Page.parse(input);
      if (!page.ok) return page;

      const chat = visibleTo(
        await loaders.chat.load(ChatId(input.chatId)),
        viewer.id
      );
      if (!chat.ok) return chat;

      return ok(await loaders.messages(page.value).load(chat.value.id));
    },

    /** Stores the message, then delivers it live to every participant. */
    async send(
      viewer: User,
      input: { readonly chatId: string; readonly content: string }
    ): Promise<Result<Message, InvalidInput | NotFound>> {
      const content = MessageContent.parse(input.content);
      if (!content.ok) return content;

      const chat = visibleTo(
        await loaders.chat.load(ChatId(input.chatId)),
        viewer.id
      );
      if (!chat.ok) return chat;

      const message = await repositories.messages.append({
        chatId: chat.value.id,
        senderId: viewer.id,
        content: content.value,
        createdAt: clock(),
      });
      await events.publish(message, chat.value.participantIds);
      return ok(message);
    },

    /** Every message sent from now on to a chat the viewer is in. */
    feed(viewer: User): AsyncIterableIterator<Message> {
      return events.subscribe(viewer.id);
    },
  };
}
