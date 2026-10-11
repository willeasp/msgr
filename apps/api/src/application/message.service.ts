import { ChatId, visibleTo } from '../domain/chat.js';
import type { InvalidInput, NotFound } from '../domain/errors.js';
import {
  MessageBody,
  MessageContent,
  type Message,
} from '../domain/message.js';
import { Picture, type RawPicture } from '../domain/picture.js';
import { Page } from '../domain/page.js';
import { ok, type Result } from '../domain/result.js';
import type { User } from '../domain/user.js';
import type { Loaders } from './loaders.js';
import { createNotifier } from './notifier.js';
import type { Dependencies } from './ports.js';

export type MessageService = ReturnType<typeof createMessageService>;

export function createMessageService(deps: Dependencies, loaders: Loaders) {
  const { repositories, events, clock } = deps;
  const notifier = createNotifier(deps);

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
    // Not awaited: the sender needn't wait for push services.
    void notifier.message(message, chat.value, viewer);
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

    /** Text, a picture, or both; each is checked before the chat is looked up. */
    async send(
      viewer: User,
      input: {
        readonly chatId: string;
        readonly content?: string | null;
        readonly picture?: RawPicture | null;
      }
    ): Promise<Result<Message, InvalidInput | NotFound>> {
      const content =
        input.content == null ? ok(null) : MessageContent.parse(input.content);
      if (!content.ok) return content;
      const picture =
        input.picture == null
          ? ok(null)
          : Picture.parse(input.picture, deps.pictures);
      if (!picture.ok) return picture;
      const body = MessageBody.of(content.value, picture.value);
      if (!body.ok) return body;
      return post(viewer, input.chatId, body.value);
    },

    /** Every message sent from now on to a chat the viewer is in. */
    feed(viewer: User): AsyncIterableIterator<Message> {
      return events.subscribe(viewer.id);
    },
  };
}
