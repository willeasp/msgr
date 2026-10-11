import { afterAll, beforeAll, describe } from 'vitest';
import { ChatId } from '../../domain/chat.js';
import {
  fixtureEmail,
  repositoryContract,
  type Fixtures,
} from '../../testing/repository-contract.js';
import { PrismaClient } from './client.js';
import { prismaRepositories } from './repositories.js';
import { toUser, userFields } from './user.repository.js';

// Point at a disposable, migrated database: every test truncates it.
const url = process.env['TEST_DATABASE_URL'];

describe.runIf(url)('prisma repositories', () => {
  let db: PrismaClient;

  beforeAll(() => {
    db = new PrismaClient({ datasourceUrl: url });
  });
  afterAll(() => db.$disconnect());

  repositoryContract(async () => {
    await db.$executeRaw`TRUNCATE "Invite", "Message", "Chat", "User" CASCADE`;
    return {
      repositories: prismaRepositories(db),
      fixtures: prismaFixtures(db),
    };
  });
});

const prismaFixtures = (db: PrismaClient): Fixtures => ({
  async user({ name, email = fixtureEmail(name), passwordHash }) {
    return toUser(
      await db.user.create({
        data: { name, email, password: passwordHash ?? 'unusable' },
        select: userFields,
      })
    );
  },

  async groupChat(title, members) {
    const row = await db.chat.create({
      data: {
        title,
        participants: { connect: members.map(({ id }) => ({ id })) },
      },
    });
    return {
      kind: 'group',
      id: ChatId(row.id),
      title,
      participantIds: members.map(({ id }) => id).sort(),
    };
  },
});
