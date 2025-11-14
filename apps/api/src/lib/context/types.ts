import { PrismaClient } from '../../../generated/prisma/index.js';
import { PubSub } from 'graphql-subscriptions';
import express from 'express';
import { User } from '../__generated__/models.js';

export interface Context {
  user: User | null;
  prisma: PrismaClient;
  res?: express.Response;
  pubsub: PubSub;
}
