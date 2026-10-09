import type { Repositories } from '../../application/ports.js';
import { prismaChatRepository } from './chat.repository.js';
import type { PrismaClient } from './client.js';
import { prismaInviteRepository } from './invite.repository.js';
import { prismaMessageRepository } from './message.repository.js';
import { prismaUserRepository } from './user.repository.js';

export const prismaRepositories = (db: PrismaClient): Repositories => ({
  users: prismaUserRepository(db),
  chats: prismaChatRepository(db),
  messages: prismaMessageRepository(db),
  invites: prismaInviteRepository(db),
});
