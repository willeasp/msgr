import { Resolvers } from '../__generated__/resolvers.js';
import { Context } from '../context/types.js';
import { User } from '../../../generated/prisma/index.js';

export const userResolvers: Resolvers<Context> = {
  Query: {
    user: async (_, { id }, context) => {
      const user = await context.prisma.user.findUnique({
        where: { id },
      });
      if (!user) return null;
      return {
        id: user.id,
        email: user.email,
        name: user.name,
      };
    },
    users: async (_, { query }, context) => {
      if (!context.user) {
        throw new Error('Not authenticated');
      }

      // Build filter based on query parameter
      const where: any = {};

      // Exclude current user from results when query is provided
      if (query) {
        where.NOT = { id: context.user!.id };
        where.OR = [
          { name: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } },
        ];
      }

      const users: User[] = await context.prisma.user.findMany({
        where,
      });

      return users.map((user) => ({
        id: user.id,
        email: user.email,
        name: user.name,
      }));
    },
    me: (_, __, context) => {
      if (!context.user) {
        throw new Error('Not authenticated');
      }
      return context.user;
    },
  },
};
