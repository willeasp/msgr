import { Resolvers } from '../__generated__/resolvers.js';
import { Context } from '../context/types.js';

export const chatResolvers: Resolvers<Context> = {
  Query: {
    chats: async (_, __, context) => {
      if (!context.user) {
        throw new Error('Not authenticated');
      }

      // Get all chats where user is a participant
      const chats = await context.prisma.chat.findMany({
        where: {
          participants: {
            some: {
              id: context.user!.id,
            },
          },
        },
        include: {
          participants: true,
          messages: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            include: {
              sender: true,
            },
          },
        },
        orderBy: {
          updatedAt: 'desc',
        },
      });

      return chats.map((chat) => {
        // Compute title for 1-on-1 chats
        let title = chat.title;
        if (chat.participants.length === 2 && !title) {
          const otherUser = chat.participants.find(
            (p) => p.id !== context.user!.id
          );
          title = otherUser ? otherUser.name : 'Chat';
        }

        return {
          id: chat.id,
          title: title || 'Group Chat',
          participants: chat.participants.map((p) => ({
            id: p.id,
            email: p.email,
            name: p.name,
          })),
          messages: chat.messages.map((m) => ({
            id: m.id,
            content: m.content,
            sender: {
              id: m.sender.id,
              email: m.sender.email,
              name: m.sender.name,
            },
            chat: { id: chat.id, title, participants: [], messages: [] },
            createdAt: m.createdAt,
          })),
        };
      });
    },
    chat: async (_, { id }, context) => {
      if (!context.user) {
        throw new Error('Not authenticated');
      }

      const chat = await context.prisma.chat.findUnique({
        where: { id },
        include: {
          participants: true,
        },
      });

      if (!chat) return null;

      // Verify user is a participant
      const isParticipant = chat.participants.some(
        (p) => p.id === context.user!.id
      );
      if (!isParticipant) {
        throw new Error('Not authorized to view this chat');
      }

      // Compute title for 1-on-1 chats
      let title = chat.title;
      if (chat.participants.length === 2) {
        const otherUser = chat.participants.find(
          (p) => p.id !== context.user!.id
        );
        title = otherUser ? otherUser.name : 'Chat';
      }

      return {
        id: chat.id,
        title: title || 'Group Chat',
        participants: chat.participants.map((p) => ({
          id: p.id,
          email: p.email,
          name: p.name,
        })),
        messages: [],
      };
    },
  },
  Mutation: {
    findOrCreateChat: async (_, { participantId }, context) => {
      if (!context.user) {
        throw new Error('Not authenticated');
      }

      // Check if 1-on-1 chat already exists
      const existingChat = await context.prisma.chat.findFirst({
        where: {
          AND: [
            {
              participants: {
                some: { id: context.user!.id },
              },
            },
            {
              participants: {
                some: { id: participantId },
              },
            },
          ],
        },
        include: {
          participants: true,
        },
      });

      // Filter to only 1-on-1 chats
      if (existingChat && existingChat.participants.length === 2) {
        const otherUser = existingChat.participants.find(
          (p) => p.id !== context.user!.id
        );
        return {
          id: existingChat.id,
          title: otherUser?.name || 'Chat',
          participants: existingChat.participants.map((p) => ({
            id: p.id,
            email: p.email,
            name: p.name,
          })),
          messages: [],
        };
      }

      // Create new chat
      const otherUser = await context.prisma.user.findUnique({
        where: { id: participantId },
      });

      const title = 'Chat';

      const chat = await context.prisma.chat.create({
        data: {
          title,
          participants: {
            connect: [{ id: context.user!.id }, { id: participantId }],
          },
        },
        include: { participants: true },
      });

      return {
        id: chat.id,
        title: otherUser?.name || 'Chat',
        participants: chat.participants.map((p) => ({
          id: p.id,
          email: p.email,
          name: p.name,
        })),
        messages: [],
      };
    },
  },
  Chat: {
    messages: async (parent, { limit = 50, offset = 0 }, context) => {
      const messages = await context.prisma.message.findMany({
        where: { chatId: parent.id },
        include: { sender: true },
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
        chat: parent,
        createdAt: m.createdAt,
      }));
    },
  },
};
