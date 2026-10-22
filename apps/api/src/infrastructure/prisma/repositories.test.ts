import { mkdirSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ChatId } from '../../domain/chat.js';
import {
  fixtureEmail,
  repositoryContract,
  type Fixtures,
} from '../../testing/repository-contract.js';
import { PrismaClient } from './client.js';
import { pendingMigrations } from './migrations.js';
import { prismaRepositories } from './repositories.js';
import { prismaStorageGauge } from './storage-gauge.js';
import { toUser, userFields } from './user.repository.js';

// Point at a disposable, migrated database: every test truncates it. So every
// test against it lives in this one file, where tests run one at a time;
// Vitest runs files side by side, and two would wipe each other's rows.
const url = process.env['TEST_DATABASE_URL'];

const truncate = (db: PrismaClient) =>
  db.$executeRaw`TRUNCATE "Invite", "ReadMark", "Message", "Chat", "User" CASCADE`;

describe.runIf(url)('prisma', () => {
  let db: PrismaClient;

  beforeAll(() => {
    db = new PrismaClient({ datasourceUrl: url });
  });
  afterAll(() => db.$disconnect());

  describe('repositories', () => {
    repositoryContract(async () => {
      await truncate(db);
      return {
        repositories: prismaRepositories(db),
        fixtures: prismaFixtures(db),
      };
    });
  });

  describe('migrations', () => {
    const MIGRATIONS = fileURLToPath(
      new URL('../../../prisma/migrations', import.meta.url)
    );

    it('sees a migrated database is up to date, and what a new migration adds', async () => {
      expect(await pendingMigrations(db, MIGRATIONS)).toEqual([]);

      // The same history, and one migration the database hasn't seen.
      const next = mkdtempSync(join(tmpdir(), 'msgr-migrations-'));
      for (const entry of readdirSync(MIGRATIONS, { withFileTypes: true })) {
        if (entry.isDirectory()) mkdirSync(join(next, entry.name));
      }
      mkdirSync(join(next, '29991231000000_next'));
      expect(await pendingMigrations(db, next)).toEqual([
        '29991231000000_next',
      ]);
    });
  });

  describe('storage gauge', () => {
    beforeEach(() => truncate(db));

    it('measures the database, its tables and each kind of content', async () => {
      const ada = await db.user.create({
        data: {
          name: 'Ada',
          email: 'ada@example.com',
          password: 'unusable',
          avatar: new Uint8Array(100),
        },
      });
      const chat = await db.chat.create({
        data: { title: 'Team', participants: { connect: { id: ada.id } } },
      });
      await db.message.createMany({
        data: [
          { chatId: chat.id, senderId: ada.id, content: 'Hello' },
          {
            chatId: chat.id,
            senderId: ada.id,
            content: 'Look',
            picture: new Uint8Array(40),
            pictureWidth: 8,
            pictureHeight: 8,
          },
        ],
      });

      const usage = await prismaStorageGauge(db).measure();

      expect(usage.databaseBytes).toBeGreaterThan(0);
      const message = usage.tables.find(({ name }) => name === 'Message');
      expect(message?.bytes).toBeGreaterThan(0);
      const contents = Object.fromEntries(
        usage.contents.map(({ kind, count, bytes }) => [kind, { count, bytes }])
      );
      expect(contents).toMatchObject({
        text: { count: 2 },
        picture: { count: 1 },
        movie: { count: 0, bytes: 0 },
        sound: { count: 0, bytes: 0 },
        avatar: { count: 1 },
      });
      // As stored: a little more than the bytes themselves, for their length.
      expect(contents['picture']?.bytes).toBeGreaterThanOrEqual(40);
      expect(contents['avatar']?.bytes).toBeGreaterThanOrEqual(100);
    });
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
