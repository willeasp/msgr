import { Resolvers } from '../__generated__/resolvers.js';
import { Context } from '../context/types.js';
import { userResolvers } from './user.resolvers.js';
import { authResolvers } from './auth.resolvers.js';
import { chatResolvers } from './chat.resolvers.js';
import { messageResolvers } from './message.resolvers.js';

/**
 * Combines all resolver modules into a single resolvers object
 */
export const resolvers: Resolvers<Context> = {
  Query: {
    ...userResolvers.Query,
    ...chatResolvers.Query,
    ...messageResolvers.Query,
  },
  Mutation: {
    ...authResolvers.Mutation,
    ...chatResolvers.Mutation,
    ...messageResolvers.Mutation,
  },
  Subscription: {
    ...messageResolvers.Subscription,
  },
  Chat: {
    ...chatResolvers.Chat,
  },
};
