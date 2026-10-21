import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from './client.js';
import { prismaStorageGauge } from './storage-gauge.js';

// Point at a disposable, migrated database: this truncates it.
const url = process.env['TEST_DATABASE_URL'];

describe.runIf(url)('prisma storage gauge', () => {
  let db: PrismaClient;

  beforeAll(async () => {
    db = new PrismaClient({ datasourceUrl: url });
    await db.$executeRaw`TRUNCATE "Invite", "ReadMark", "Message", "Chat", "User" CASCADE`;
  });
  afterAll(() => db.$disconnect());

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
