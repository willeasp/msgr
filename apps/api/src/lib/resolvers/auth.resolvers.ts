import bcrypt from 'bcrypt';
import { Resolvers } from '../__generated__/resolvers.js';
import { Context } from '../context/types.js';
import { signJWT } from '../auth/jwt.js';

export const authResolvers: Resolvers<Context> = {
  Mutation: {
    login: async (_, { email, password }, context) => {
      const user = await context.prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        throw new Error('Invalid email or password');
      }

      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        throw new Error('Invalid email or password');
      }

      const token = await signJWT({ userId: user.id });

      context.res?.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 2 * 60 * 60 * 1000,
      });

      return {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
        token,
      };
    },
    logout: (_, __, context) => {
      context.res?.clearCookie('token');
      return true;
    },
  },
};
