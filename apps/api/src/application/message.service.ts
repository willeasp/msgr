import { ChatId, visibleTo, type Chat } from '../domain/chat.js';
import {
  invalidInput,
  notFound,
  type InvalidInput,
  type NotFound,
} from '../domain/errors.js';
import {
  idTaken,
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
import {
  Upload,
  UPLOAD_KEPT_MS,
  UPLOADS_KEPT_EACH,
  type Media,
  type RawUpload,
} from '../domain/upload.js';
import type { User } from '../domain/user.js';
import type { Loaders } from './loaders.js';
import { createNotifier } from './notifier.js';
import type { Dependencies } from './ports.js';

export type MessageService = ReturnType<typeof createMessageService>;

/** A page of history, as asked for: see `Page.parse`. */
type PageArgs = Parameters<typeof Page.parse>[0];

export function createMessageService(deps: Dependencies, loaders: Loaders) {
  const { repositories, events, typingEvents, clock } = deps;
  const notifier = createNotifier(deps);

  /** Stores the message, then delivers it live to every participant. */
  async function post(
    viewer: User,
    chat: Chat,
    body: MessageBody,
    id: MessageId | undefined
  ): Promise<Result<Message, InvalidInput>> {
    const message = await repositories.messages.append({
      id,
      ...body,
      chatId: chat.id,
      senderId: viewer.id,
      createdAt: clock(),
    });
    if (!message) {
      // The id the sender chose is stored already: sent before, its answer
      // lost on the way back, or the same send a moment ago.
      const sent = id && (await loaders.message.load(id));
      if (!sent) throw new Error(`Message ${id} is taken, but not there`);
      return again(viewer, chat, sent);
    }
    await events.publish(message, chat.participantIds);
    // Not awaited: the sender needn't wait for push services.
    void notifier.message(message, chat, viewer);
    return ok(message);
  }

  /**
   * A send under an id that's a stored message's: the same message again,
   * stored and delivered once, if it's the sender's own in that chat;
   * anyone else's, refused.
   */
  const again = (
    viewer: User,
    chat: Chat,
    sent: Message
  ): Result<Message, InvalidInput> =>
    sent.senderId === viewer.id && sent.chatId === chat.id
      ? ok(sent)
      : err(idTaken());

  /**
   * What the viewer put under the message's id ahead of it: null when
   * there's nothing of theirs, which its message may have taken already.
   */
  async function uploadOf(
    viewer: User,
    id: MessageId,
    part: MediaPart
  ): Promise<Result<Media | null, InvalidInput>> {
    const upload = await loaders.upload.load(id);
    if (!upload) return ok(null);
    if (upload.uploaderId !== viewer.id) return err(idTaken());
    if (mediaPartOf(upload) !== part) {
      return err(invalidInput('uploaded', `What was uploaded isn't a ${part}`));
    }
    return ok(upload);
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

  /**
   * A page of the chat's history. A cursor must be one of the chat's own
   * messages: any other answers as missing, so a client starts again from the
   * newest rather than taking an empty page for no news.
   */
  async function history(
    chat: Chat,
    page: Page
  ): Promise<Result<Message[], NotFound>> {
    if (page.kind !== 'newest') {
      const from = await loaders.message.load(page.cursor);
      if (from?.chatId !== chat.id) return err(notFound('Message'));
    }
    return ok(await loaders.messages(page).load(chat.id));
  }

  return {
    /** A message in one of the viewer's chats, or null, as for a missing one. */
    async find(viewer: User, messageId: string): Promise<Message | null> {
      const message = await visible(viewer, messageId);
      return message.ok ? message.value : null;
    },

    /** A page of the history of one of the viewer's chats (`history`). */
    async list(
      viewer: User,
      input: PageArgs & { readonly chatId: string }
    ): Promise<Result<Message[], InvalidInput | NotFound>> {
      const page = Page.parse(input);
      if (!page.ok) return page;

      const chat = visibleTo(
        await loaders.chat.load(ChatId(input.chatId)),
        viewer.id
      );
      if (!chat.ok) return chat;

      return history(chat.value, page.value);
    },

    /**
     * A page of a chat already shown to the viewer (`Chat.messages`), with
     * the same rules as `list`.
     */
    async history(
      chat: Chat,
      args: PageArgs
    ): Promise<Result<Message[], InvalidInput | NotFound>> {
      const page = Page.parse(args);
      return page.ok ? history(chat, page.value) : page;
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
      const media = await loaders.media.load(message.value.id);
      return media?.part === part ? ok(media.bytes) : err(notFound('Message'));
    },

    /**
     * Puts a message's picture, movie or sound ahead of the message (ADR
     * 0018), under the id its sender chose for it, checked as any message's
     * is. Putting it again replaces it. An id that's someone else's upload,
     * or a stored message, is taken, unless it's the viewer's own message
     * with that part: it's there already, and nothing changes.
     */
    async upload(
      viewer: User,
      messageId: string,
      raw: RawUpload,
      bytes: Uint8Array
    ): Promise<Result<true, InvalidInput>> {
      const id = MessageId.parseChosen(messageId);
      if (!id.ok) return id;
      // Put again after its message took it (Try Again after a lost
      // answer): it's there, and nothing need be decoded to say so.
      const sent = await loaders.message.load(id.value);
      if (sent) {
        return sent.senderId === viewer.id && mediaPartOf(sent) === raw.part
          ? ok(true)
          : err(idTaken());
      }
      const media = Upload.parse(raw, bytes, deps.pictures);
      if (!media.ok) return media;
      const now = clock();
      const kept = await repositories.uploads.put({
        id: id.value,
        uploaderId: viewer.id,
        createdAt: now,
        ...media.value,
      });
      // Whatever was put and never sent goes in time, and nobody holds
      // more than a few.
      await repositories.uploads.forget(
        new Date(now.getTime() - UPLOAD_KEPT_MS),
        viewer.id,
        UPLOADS_KEPT_EACH
      );
      return kept ? ok(true) : err(idTaken());
    },

    /**
     * Text, a picture, a movie or a sound, or text with one of them; each is
     * checked before the chat is looked up. A picture, movie or sound put
     * ahead of the message (`upload`) is named by `uploaded`; one in the
     * input itself is how a shell one version behind sends it.
     */
    async send(
      viewer: User,
      input: {
        /** Chosen by the sender, so a retry returns what was stored rather than posting again. */
        readonly id?: string | null;
        readonly chatId: string;
        readonly content?: string | null;
        /** What the sender put under the message's id before sending it. */
        readonly uploaded?: MediaPart | null;
        readonly picture?: RawPicture | null;
        readonly movie?: RawMovie | null;
        readonly sound?: RawSound | null;
      }
    ): Promise<Result<Message, InvalidInput | NotFound>> {
      const id =
        input.id == null ? ok(undefined) : MessageId.parseChosen(input.id);
      if (!id.ok) return id;
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
      // What it holds, the upload standing for its part until it's fetched.
      const { uploaded } = input;
      if (uploaded && (picture.value || movie.value || sound.value)) {
        return err(
          invalidInput(
            'uploaded',
            'Attach one picture, movie or sound, not two'
          )
        );
      }
      const shape = MessageBody.of(
        content.value,
        picture.value ?? (uploaded === 'picture' || null),
        movie.value ?? (uploaded === 'movie' || null),
        sound.value ?? (uploaded === 'sound' || null)
      );
      if (!shape.ok) return shape;
      // An upload is put under its message's id: there's none without one.
      if (uploaded && !id.value) {
        return err(invalidInput('id', 'Send an upload under its message’s id'));
      }

      const chat = visibleTo(
        await loaders.chat.load(ChatId(input.chatId)),
        viewer.id
      );
      if (!chat.ok) return chat;
      const upload =
        uploaded && id.value
          ? await uploadOf(viewer, id.value, uploaded)
          : ok(null);
      if (!upload.ok) return upload;
      if (uploaded && id.value && !upload.value) {
        // Nothing put under its id: its message took it, stored before and
        // its answer lost, or it was never put (or put too long ago).
        const sent = await loaders.message.load(id.value);
        return sent
          ? again(viewer, chat.value, sent)
          : err(invalidInput('uploaded', 'Upload it before sending it'));
      }
      const body = MessageBody.of(
        content.value,
        upload.value?.picture ?? picture.value,
        upload.value?.movie ?? movie.value,
        upload.value?.sound ?? sound.value
      );
      if (!body.ok) return body;
      return post(viewer, chat.value, body.value, id.value);
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
