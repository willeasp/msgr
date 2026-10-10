import { ChatId, visibleTo } from '../domain/chat.js';
import type { InvalidInput, NotFound } from '../domain/errors.js';
import { Drawing } from '../domain/drawing.js';
import {
  MessageContent,
  type Message,
  type MessageBody,
} from '../domain/message.js';
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
  /** Stores the message, then delivers it live to every participant. */
  async function post(
    viewer: User,
    chatId: string,
    body: MessageBody
  ): Promise<Result<Message, NotFound>> {
    const chat = visibleTo(await loaders.chat.load(ChatId(chatId)), viewer.id);
    if (!chat.ok) return chat;

    const message = await repositories.messages.append({
      ...body,
      chatId: chat.value.id,
      senderId: viewer.id,
      createdAt: clock(),
    });
    await events.publish(message, chat.value.participantIds);
    return ok(message);
  }

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

    async send(
      viewer: User,
      input: { readonly chatId: string; readonly content: string }
    ): Promise<Result<Message, InvalidInput | NotFound>> {
      const content = MessageContent.parse(input.content);
      if (!content.ok) return content;
      return post(viewer, input.chatId, {
        kind: 'text',
        content: content.value,
      });
    },

    async sendDrawing(
      viewer: User,
      input: { readonly chatId: string; readonly drawing: string }
    ): Promise<Result<Message, InvalidInput | NotFound>> {
      const drawing = Drawing.parse(input.drawing);
      if (!drawing.ok) return drawing;
      return post(viewer, input.chatId, {
        kind: 'drawing',
        drawing: drawing.value,
      });
    },

    /** Every message sent from now on to a chat the viewer is in. */
    feed(viewer: User): AsyncIterableIterator<Message> {
      return events.subscribe(viewer.id);
    },
  };
}
