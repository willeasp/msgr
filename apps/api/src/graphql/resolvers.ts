import { loadExisting } from '../application/loaders.js';
import { counterpart } from '../domain/chat.js';
import type { Message } from '../domain/message.js';
import { Page } from '../domain/page.js';
import type { ChatAdded } from '../domain/chat.js';
import type {
  ChatAddedReason,
  ChatKind,
  Resolvers,
} from './__generated__/resolvers.js';
import { requireViewer, startSession } from './context.js';
import { unwrap } from './errors.js';
import { DateTime } from './scalars.js';

/*
 * Root fields authorize and delegate to a service. Nested fields only walk
 * relations of something the viewer was already allowed to see, through the
 * request's loaders, so a whole query costs one batch per relation.
 */
export const resolvers: Resolvers = {
  DateTime,

  Query: {
    me: (_, __, { viewer }) => viewer,
    users: async (_, { query }, ctx) =>
      unwrap(await ctx.services.users.search(requireViewer(ctx), query)),
    chats: (_, __, ctx) => ctx.services.chats.listFor(requireViewer(ctx)),
    chat: async (_, { id }, ctx) => {
      const chat = await ctx.services.chats.find(requireViewer(ctx), id);
      return chat.ok ? chat.value : null;
    },
    messages: async (_, args, ctx) =>
      unwrap(await ctx.services.messages.list(requireViewer(ctx), args)),
    channels: (_, __, ctx) => {
      requireViewer(ctx);
      return ctx.services.chats.listChannels();
    },
  },

  Mutation: {
    login: async (_, credentials, ctx) => {
      const session = unwrap(await ctx.services.auth.login(credentials));
      startSession(ctx, session);
      return session;
    },
    logout: (_, __, ctx) => {
      ctx.cookie.clear();
      return true;
    },
    signUp: async (_, { input }, ctx) => {
      const welcome = unwrap(await ctx.services.auth.signUp(input));
      startSession(ctx, welcome);
      return welcome;
    },
    createInvite: (_, __, ctx) =>
      ctx.services.invites.create(requireViewer(ctx)),
    findOrCreateChat: async (_, { participantId }, ctx) =>
      unwrap(
        await ctx.services.chats.openDirect(requireViewer(ctx), participantId)
      ),
    sendMessage: async (_, { input }, ctx) =>
      unwrap(await ctx.services.messages.send(requireViewer(ctx), input)),
    sendDrawing: async (_, { input }, ctx) =>
      unwrap(
        await ctx.services.messages.sendDrawing(requireViewer(ctx), input)
      ),
    joinChannel: async (_, { name }, ctx) =>
      unwrap(await ctx.services.chats.joinChannel(requireViewer(ctx), name)),
    leaveChannel: async (_, { chatId }, ctx) =>
      unwrap(await ctx.services.chats.leaveChannel(requireViewer(ctx), chatId)),
    addToChannel: async (_, { chatId, userIds }, ctx) =>
      unwrap(
        await ctx.services.chats.addToChannel(
          requireViewer(ctx),
          chatId,
          userIds
        )
      ),
  },

  Subscription: {
    messageReceived: {
      subscribe: (_, __, ctx) => ctx.services.messages.feed(requireViewer(ctx)),
      resolve: (message: Message) => message,
    },
    chatAdded: {
      subscribe: (_, __, ctx) =>
        ctx.services.chats.additions(requireViewer(ctx)),
      resolve: (event: ChatAdded) => event,
    },
  },

  ChatAdded: {
    by: (event, _, { loaders }) => loadExisting(loaders.user, event.by),
    reason: (event) =>
      (event.reason === 'invite-accepted'
        ? 'INVITE_ACCEPTED'
        : 'ADDED_TO_CHANNEL') as ChatAddedReason,
  },

  Chat: {
    kind: (chat) => chat.kind.toUpperCase() as ChatKind,
    title: async (chat, _, ctx) => {
      switch (chat.kind) {
        case 'group':
          return chat.title;
        case 'channel':
          return `#${chat.name}`;
        case 'direct':
          return (
            await loadExisting(
              ctx.loaders.user,
              counterpart(chat, requireViewer(ctx).id)
            )
          ).name;
      }
    },
    participants: (chat, _, { loaders }) =>
      Promise.all(
        chat.participantIds.map((id) => loadExisting(loaders.user, id))
      ),
    messages: (chat, page, { loaders }) =>
      loaders.messages(unwrap(Page.parse(page))).load(chat.id),
  },

  ChannelListing: {
    name: (channel) => channel.name,
    participantCount: (channel) => channel.participantIds.length,
    joined: (channel, _, ctx) =>
      channel.participantIds.includes(requireViewer(ctx).id),
    chatId: (channel) => channel.id,
  },

  Message: {
    sender: (message, _, { loaders }) =>
      loadExisting(loaders.user, message.senderId),
    chat: (message, _, { loaders }) =>
      loadExisting(loaders.chat, message.chatId),
  },
};
