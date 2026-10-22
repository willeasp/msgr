import { ChatId, visibleTo } from '../domain/chat.js';
import {
  notFound,
  type InvalidInput,
  type NotFound,
} from '../domain/errors.js';
import {
  mediaPartOf,
  MessageBody,
  MessageContent,
  MessageId,
  type MediaPart,
  type Message,
} from '../domain/message.js';
import { Movie, type RawMovie } from '../domain/movie.js';
import { Picture, type RawPicture } from '../domain/picture.js';
import { Sound, type RawSound } from '../domain/sound.js';
import { Page } from '../domain/page.js';
import { err, ok, type Result } from '../domain/result.js';
import { typingRecipients, type Typing } from '../domain/typing.js';
import type { User } from '../domain/user.js';
import type { Loaders } from './loaders.js';
import { createNotifier } from './notifier.js';
import type { Dependencies } from './ports.js';

export type MessageService = ReturnType<typeof createMessageService>;

export function createMessageService(deps: Dependencies, loaders: Loaders) {
  const { repositories, events, typingEvents, clock } = deps;
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

  /**
   * A message in one of the viewer's chats. Anyone else's answers exactly
   * like a missing one.
   */
  async function visible(
    viewer: User,
    messageId: string
  ): Promise<Result<Message, NotFound>> {
    const message = await loaders.message.load(MessageId(messageId));
    if (!message) return err(notFound('Message'));
    const chat = visibleTo(await loaders.chat.load(message.chatId), viewer.id);
    return chat.ok ? ok(message) : err(notFound('Message'));
  }

  return {
    /** A message in one of the viewer's chats, or null, as for a missing one. */
    async find(viewer: User, messageId: string): Promise<Message | null> {
      const message = await visible(viewer, messageId);
      return message.ok ? message.value : null;
    },

    /**
     * A page of a chat's history. A cursor must be one of the chat's own
     * messages: any other answers as missing, so a client starts again from
     * the newest rather than taking an empty page for no news.
     */
    async list(
      viewer: User,
      input: {
        readonly chatId: string;
        readonly limit?: number | null;
        readonly offset?: number | null;
        readonly before?: string | null;
        readonly after?: string | null;
      }
    ): Promise<Result<Message[], InvalidInput | NotFound>> {
      const page = Page.parse(input);
      if (!page.ok) return page;

      const chat = visibleTo(
        await loaders.chat.load(ChatId(input.chatId)),
        viewer.id
      );
      if (!chat.ok) return chat;

      const cursor = page.value.before ?? page.value.after;
      if (cursor !== null) {
        const from = await loaders.message.load(cursor);
        if (from?.chatId !== chat.value.id) return err(notFound('Message'));
      }

      return ok(await loaders.messages(page.value).load(chat.value.id));
    },

    /**
     * The bytes of a message's picture, movie or sound, for whoever may see
     * the message. Any other message, or a part it hasn't, answers as missing.
     */
    async media(
      viewer: User,
      messageId: string,
      part: MediaPart
    ): Promise<Result<Uint8Array<ArrayBuffer>, NotFound>> {
      const message = await visible(viewer, messageId);
      if (!message.ok) return message;
      const bytes =
        mediaPartOf(message.value) === part
          ? await loaders.media.load(message.value.id)
          : null;
      return bytes ? ok(bytes) : err(notFound('Message'));
    },

    /**
     * Text, a picture, a movie or a sound, or text with one of them; each is
     * checked before the chat is looked up.
     */
    async send(
      viewer: User,
      input: {
        readonly chatId: string;
        readonly content?: string | null;
        readonly picture?: RawPicture | null;
        readonly movie?: RawMovie | null;
        readonly sound?: RawSound | null;
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
      const movie = input.movie == null ? ok(null) : Movie.parse(input.movie);
      if (!movie.ok) return movie;
      const sound = input.sound == null ? ok(null) : Sound.parse(input.sound);
      if (!sound.ok) return sound;
      const body = MessageBody.of(
        content.value,
        picture.value,
        movie.value,
        sound.value
      );
      if (!body.ok) return body;
      return post(viewer, input.chatId, body.value);
    },

    /**
     * The viewer has read the message's chat up to and including it: this
     * message and every one before it.
     */
    async markRead(
      viewer: User,
      messageId: string
    ): Promise<Result<true, NotFound>> {
      const message = await visible(viewer, messageId);
      if (!message.ok) return message;
      await repositories.reads.markRead(message.value, viewer.id, clock());
      return ok(true);
    },

    /** Tells the chat's other participants the viewer is writing to it. */
    async typing(
      viewer: User,
      chatId: string
    ): Promise<Result<true, NotFound>> {
      const chat = visibleTo(
        await loaders.chat.load(ChatId(chatId)),
        viewer.id
      );
      if (!chat.ok) return chat;
      const event: Typing = { chatId: chat.value.id, user: viewer };
      await typingEvents.publish(
        event,
        typingRecipients(chat.value, viewer.id)
      );
      return ok(true);
    },

    /** Everyone writing to a chat the viewer is in, from now on; never the viewer. */
    typists(viewer: User): AsyncIterableIterator<Typing> {
      return typingEvents.subscribe(viewer.id);
    },

    /** Every message sent from now on to a chat the viewer is in. */
    feed(viewer: User): AsyncIterableIterator<Message> {
      return events.subscribe(viewer.id);
    },
  };
}
