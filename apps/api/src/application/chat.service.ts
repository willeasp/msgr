import {
  ChannelName,
  ChatId,
  directPair,
  visibleTo,
  type ChannelChat,
  type Chat,
  type ChatAdded,
} from '../domain/chat.js';
import {
  invalidInput,
  notFound,
  type InvalidInput,
  type NotFound,
} from '../domain/errors.js';
import { err, ok, type Result } from '../domain/result.js';
import { UserId, type User } from '../domain/user.js';
import type { Loaders } from './loaders.js';
import type { Dependencies } from './ports.js';

export type ChatService = ReturnType<typeof createChatService>;

export function createChatService(
  { repositories, chatEvents }: Dependencies,
  loaders: Loaders
) {
  return {
    listFor(viewer: User): Promise<Chat[]> {
      return repositories.chats.findByParticipant(viewer.id);
    },

    async find(viewer: User, chatId: string): Promise<Result<Chat, NotFound>> {
      return visibleTo(await loaders.chat.load(ChatId(chatId)), viewer.id);
    },

    /** The viewer's direct chat with `participantId`, created on first contact. */
    async openDirect(
      viewer: User,
      participantId: string
    ): Promise<Result<Chat, InvalidInput | NotFound>> {
      const pair = directPair(viewer.id, UserId(participantId));
      if (!pair.ok) return pair;

      const participant = await loaders.user.load(UserId(participantId));
      if (!participant) return err(notFound('User'));

      return ok(await repositories.chats.saveDirect(pair.value));
    },

    /** Every channel there is: anyone signed in may join any of them. */
    listChannels(): Promise<ChannelChat[]> {
      return repositories.chats.findChannels();
    },

    /** Puts the viewer in the channel called `name`, creating it if need be. */
    async joinChannel(
      viewer: User,
      name: string
    ): Promise<Result<ChannelChat, InvalidInput>> {
      const channelName = ChannelName.parse(name);
      if (!channelName.ok) return channelName;
      return ok(
        await repositories.chats.joinChannel(channelName.value, viewer.id)
      );
    },

    /**
     * Puts people in a channel the viewer is in, and tells each newcomer who
     * added them. Someone who doesn't exist adds nobody.
     */
    async addToChannel(
      viewer: User,
      chatId: string,
      userIds: readonly string[]
    ): Promise<Result<ChannelChat, InvalidInput | NotFound>> {
      const chat = visibleTo(
        await loaders.chat.load(ChatId(chatId)),
        viewer.id
      );
      if (!chat.ok) return chat;
      if (chat.value.kind !== 'channel') {
        return err(
          invalidInput('chatId', 'Only channels can have people added')
        );
      }

      const people = await Promise.all(
        userIds.map((id) => loaders.user.load(UserId(id)))
      );
      if (people.includes(null)) return err(notFound('User'));

      let channel: ChannelChat = chat.value;
      const newcomers = people.filter(
        (person): person is User =>
          !!person && !channel.participantIds.includes(person.id)
      );
      for (const person of newcomers) {
        channel = await repositories.chats.joinChannel(channel.name, person.id);
      }
      await Promise.all(
        newcomers.map((person) =>
          chatEvents.publish(
            { chat: channel, by: viewer.id, reason: 'added-to-channel' },
            person.id
          )
        )
      );
      return ok(channel);
    },

    /** Every chat that comes to include the viewer from now on, without them opening it. */
    additions(viewer: User): AsyncIterableIterator<ChatAdded> {
      return chatEvents.subscribe(viewer.id);
    },

    /** Direct and group chats have a fixed set of people; only channels can be left. */
    async leaveChannel(
      viewer: User,
      chatId: string
    ): Promise<Result<true, InvalidInput | NotFound>> {
      const chat = visibleTo(
        await loaders.chat.load(ChatId(chatId)),
        viewer.id
      );
      if (!chat.ok) return chat;
      if (chat.value.kind !== 'channel') {
        return err(invalidInput('chatId', 'Only channels can be left'));
      }
      await repositories.chats.leaveChannel(chat.value.id, viewer.id);
      return ok(true);
    },
  };
}
