import { ChatId, directPair, visibleTo, type Chat } from '../domain/chat.js';
import {
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
  { repositories }: Dependencies,
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
  };
}
