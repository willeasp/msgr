import { Resolvers } from '../__generated__/resolvers.js';
import { Message } from '../__generated__/models.js';
import { Context } from '../context/types.js';
import {
  pubsub,
  MESSAGE_RECEIVED,
  createAsyncIterator,
} from '../config/pubsub.js';

export const messageResolvers: Resolvers<Context> = {
  Query: {
    messages: async (_, { chatId, limit = 50, offset = 0 }, context) => {
      if (!context.user) {
        throw new Error('Not authenticated');
      }

      // Verify user is a participant in the chat
      const chat = await context.prisma.chat.findUnique({
        where: { id: chatId },
        include: { participants: true },
      });

      if (!chat) {
        throw new Error('Chat not found');
      }

      const isParticipant = chat.participants.some(
        (p) => p.id === context.user!.id
      );
      if (!isParticipant) {
        throw new Error('Not authorized to view messages in this chat');
      }

      const messages = await context.prisma.message.findMany({
        where: { chatId },
        include: {
          sender: true,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      });

      return messages.reverse().map((m) => ({
        id: m.id,
        content: m.content,
        sender: {
          id: m.sender.id,
          email: m.sender.email,
          name: m.sender.name,
        },
        chat: {
          id: chat.id,
          title: chat.title || '',
          participants: [],
          messages: [],
        },
        createdAt: m.createdAt,
      }));
    },
  },
  Mutation: {
    sendMessage: async (_, { input }, context) => {
      if (!context.user) {
        throw new Error('Not authenticated');
      }

      const chat = await context.prisma.chat.findUnique({
        where: { id: input.chatId },
        include: { participants: true },
      });

      if (!chat) {
        throw new Error('Chat not found');
      }

      const isParticipant = chat.participants.some(
        (p) => p.id === context.user!.id
      );
      if (!isParticipant) {
        throw new Error('Not authorized to send messages in this chat');
      }

      const message = await context.prisma.message.create({
        data: {
          content: input.content,
          senderId: context.user!.id,
          chatId: input.chatId,
        },
        include: {
          sender: true,
          chat: {
            include: { participants: true },
          },
        },
      });

      // Update chat's updatedAt
      await context.prisma.chat.update({
        where: { id: input.chatId },
        data: { updatedAt: new Date() },
      });

      const messagePayload = {
        id: message.id,
        content: message.content,
        sender: {
          id: message.sender.id,
          email: message.sender.email,
          name: message.sender.name,
        },
        chat: {
          id: message.chat.id,
          title: message.chat.title || '',
          participants: message.chat.participants.map((p) => ({
            id: p.id,
            email: p.email,
            name: p.name,
          })),
          messages: [],
        },
        createdAt: message.createdAt,
      };

      // Publish to all participants in the chat
      pubsub.publish(MESSAGE_RECEIVED, { messageReceived: messagePayload });

      return messagePayload;
    },
  },
  Subscription: {
    messageReceived: {
      subscribe: (_: any, __: any, context: Context) => {
        if (!context.user) {
          throw new Error('Not authenticated');
        }
        return createAsyncIterator(pubsub, MESSAGE_RECEIVED);
      },
      resolve: async (
        payload: { messageReceived: Message },
        _args: any,
        context: Context
      ) => {
        // Filter messages: only return if user is participant in the chat
        const message = payload.messageReceived;
        const isParticipant = message.chat.participants.some(
          (p) => p.id === context.user!.id
        );

        if (isParticipant) {
          return message;
        }

        // Return null if user is not a participant
        // Note: This will not send the message to non-participants
        return null as any;
      },
    },
  },
};
