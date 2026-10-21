import { toBase64 } from '@msgr/bitmap';
import { loadExisting } from '../application/loaders.js';
import { counterpart } from '../domain/chat.js';
import type { Message } from '../domain/message.js';
import { Page } from '../domain/page.js';
import type { ChatAdded } from '../domain/chat.js';
import type { Typing } from '../domain/typing.js';
import type { User } from '../domain/user.js';
import type {
  ChatAddedReason,
  ChatKind,
  ContentKind,
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
    message: (_, { id }, ctx) =>
      ctx.services.messages.find(requireViewer(ctx), id),
    linkPreview: (_, { messageId }, ctx) =>
      ctx.services.linkPreviews.forMessage(requireViewer(ctx), messageId),
    channels: (_, __, ctx) => {
      requireViewer(ctx);
      return ctx.services.chats.listChannels();
    },
    pushKey: (_, __, ctx) => ctx.services.push.key(),
    inviteRedeemable: (_, { code }, ctx) =>
      ctx.services.invites.isRedeemable(code),
    admin: (_, __, ctx) => ctx.services.admin.admit(requireViewer(ctx)),
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
    markRead: async (_, { messageId }, ctx) =>
      unwrap(
        await ctx.services.messages.markRead(requireViewer(ctx), messageId)
      ),
    typing: async (_, { chatId }, ctx) =>
      unwrap(await ctx.services.messages.typing(requireViewer(ctx), chatId)),
    updateProfile: async (_, { input }, ctx) =>
      unwrap(
        await ctx.services.users.updateProfile(requireViewer(ctx), {
          name: input.name,
          avatar: input.avatar ?? null,
        })
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
    enablePush: async (_, { subscription }, ctx) =>
      unwrap(await ctx.services.push.enable(requireViewer(ctx), subscription)),
    disablePush: (_, { endpoint }, ctx) =>
      ctx.services.push.disable(requireViewer(ctx), endpoint),
  },

  Subscription: {
    messageReceived: {
      subscribe: (_, __, ctx) => ctx.services.messages.feed(requireViewer(ctx)),
      resolve: (message: Message) => message,
    },
    typing: {
      subscribe: (_, __, ctx) =>
        ctx.services.messages.typists(requireViewer(ctx)),
      resolve: (event: Typing) => event,
    },
    chatAdded: {
      subscribe: (_, __, ctx) =>
        ctx.services.chats.additions(requireViewer(ctx)),
      resolve: (event: ChatAdded) => event,
    },
    profileChanged: {
      subscribe: (_, __, ctx) =>
        ctx.services.users.profileChanges(requireViewer(ctx)),
      resolve: (user: User) => user,
    },
    watching: {
      subscribe: (_, { chatId }, ctx) =>
        ctx.services.push.watch(requireViewer(ctx), chatId),
      resolve: () => true,
    },
  },

  Admin: {
    storage: (_, __, ctx) => ctx.services.admin.storage(),
  },

  Storage: {
    usedBytes: (storage) => storage.databaseBytes,
  },

  StoredContent: {
    kind: (content) => content.kind.toUpperCase() as ContentKind,
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
    counterpart: (chat, _, ctx) =>
      chat.kind === 'direct'
        ? loadExisting(
            ctx.loaders.user,
            counterpart(chat, requireViewer(ctx).id)
          )
        : null,
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

  Picture: {
    bits: (picture) => toBase64(picture.deflated),
  },

  Movie: {
    bits: (movie) => toBase64(movie.coded),
  },

  Sound: {
    bits: (sound) => toBase64(sound.coded),
  },

  Message: {
    sender: (message, _, { loaders }) =>
      loadExisting(loaders.user, message.senderId),
    chat: (message, _, { loaders }) =>
      loadExisting(loaders.chat, message.chatId),
    readBy: (message, _, { loaders }) => loaders.reads.load(message.id),
  },

  MessageRead: {
    reader: (read, _, { loaders }) => loadExisting(loaders.user, read.readerId),
  },
};
