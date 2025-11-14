import express from 'express';
import { Context } from './types.js';
import { User } from '../__generated__/models.js';
import { verifyJWT } from '../auth/jwt.js';
import { prisma } from '../server/prisma.js';
import { pubsub } from '../config/pubsub.js';

/**
 * Context function for HTTP requests
 */
export const httpContextFunction = async ({
  req,
  res,
}: {
  req: express.Request;
  res: express.Response;
}): Promise<Context> => {
  const token = req.cookies.token;
  let user: User | null = null;

  if (token) {
    try {
      const payload = await verifyJWT(token);
      if (payload.userId && typeof payload.userId === 'string') {
        const dbUser = await prisma.user.findUnique({
          where: { id: payload.userId },
        });
        if (dbUser) {
          user = {
            id: dbUser.id,
            email: dbUser.email,
            name: dbUser.name,
          };
        }
      }
    } catch (error) {
      console.error('Token verification failed:', error);
    }
  }

  return { user, prisma, res, pubsub };
};

/**
 * Context function for WebSocket subscriptions
 */
export const wsContextFunction = async (ctx: {
  connectionParams: { token?: string };
}) => {
  const token = ctx.connectionParams?.token;
  console.log(
    'WebSocket connection attempt, token:',
    token ? 'present' : 'missing'
  );
  let user: User | null = null;

  if (token) {
    try {
      const payload = await verifyJWT(token);
      console.log('JWT verified, payload:', payload);
      if (payload.userId && typeof payload.userId === 'string') {
        const dbUser = await prisma.user.findUnique({
          where: { id: payload.userId },
        });
        if (dbUser) {
          user = {
            id: dbUser.id,
            email: dbUser.email,
            name: dbUser.name,
          };
          console.log('User authenticated for WebSocket:', user.id);
        } else {
          console.log('User not found in database:', payload.userId);
        }
      }
    } catch (error) {
      console.error('Token verification failed:', error);
    }
  } else {
    console.log('No token provided in WebSocket connectionParams');
  }

  return { user, prisma, pubsub };
};
