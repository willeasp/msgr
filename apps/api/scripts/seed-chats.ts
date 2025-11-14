import { PrismaClient } from '../generated/prisma/index.js';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database with chat data...');

  // Create users (including existing test user)
  const password = 'password123';
  const hashedPassword = await bcrypt.hash(password, 10);

  const testUser = await prisma.user.upsert({
    where: { email: 'test@example.com' },
    update: {},
    create: {
      email: 'test@example.com',
      name: 'Test User',
      password: hashedPassword,
    },
  });

  const alice = await prisma.user.upsert({
    where: { email: 'alice@example.com' },
    update: {},
    create: {
      email: 'alice@example.com',
      name: 'Alice Johnson',
      password: hashedPassword,
    },
  });

  const bob = await prisma.user.upsert({
    where: { email: 'bob@example.com' },
    update: {},
    create: {
      email: 'bob@example.com',
      name: 'Bob Smith',
      password: hashedPassword,
    },
  });

  const charlie = await prisma.user.upsert({
    where: { email: 'charlie@example.com' },
    update: {},
    create: {
      email: 'charlie@example.com',
      name: 'Charlie Brown',
      password: hashedPassword,
    },
  });

  const diana = await prisma.user.upsert({
    where: { email: 'diana@example.com' },
    update: {},
    create: {
      email: 'diana@example.com',
      name: 'Diana Prince',
      password: hashedPassword,
    },
  });

  console.log('✅ Users created');

  // Delete existing chats and messages to start fresh
  await prisma.message.deleteMany({});
  await prisma.chat.deleteMany({});
  console.log('🗑️  Cleared existing chats and messages');

  // Create chats with test user
  // Chat 1: Test User <-> Alice
  const chat1 = await prisma.chat.create({
    data: {
      title: alice.name,
      participants: {
        connect: [{ id: testUser.id }, { id: alice.id }],
      },
    },
  });

  await prisma.message.createMany({
    data: [
      {
        content: 'Hey Alice! How are you doing?',
        senderId: testUser.id,
        chatId: chat1.id,
        createdAt: new Date('2024-01-15T10:00:00Z'),
      },
      {
        content: "Hi! I'm doing great, thanks for asking! How about you?",
        senderId: alice.id,
        chatId: chat1.id,
        createdAt: new Date('2024-01-15T10:05:00Z'),
      },
      {
        content: 'Pretty good! Working on some exciting projects.',
        senderId: testUser.id,
        chatId: chat1.id,
        createdAt: new Date('2024-01-15T10:10:00Z'),
      },
      {
        content: 'That sounds awesome! Tell me more about them!',
        senderId: alice.id,
        chatId: chat1.id,
        createdAt: new Date('2024-01-15T10:15:00Z'),
      },
    ],
  });

  // Chat 2: Test User <-> Bob
  const chat2 = await prisma.chat.create({
    data: {
      title: bob.name,
      participants: {
        connect: [{ id: testUser.id }, { id: bob.id }],
      },
    },
  });

  await prisma.message.createMany({
    data: [
      {
        content: 'Bob, did you see the latest updates?',
        senderId: testUser.id,
        chatId: chat2.id,
        createdAt: new Date('2024-01-14T14:00:00Z'),
      },
      {
        content: 'Yes! They look amazing! Great work!',
        senderId: bob.id,
        chatId: chat2.id,
        createdAt: new Date('2024-01-14T14:30:00Z'),
      },
      {
        content: 'Thanks! Let me know if you have any feedback.',
        senderId: testUser.id,
        chatId: chat2.id,
        createdAt: new Date('2024-01-14T15:00:00Z'),
      },
    ],
  });

  // Chat 3: Test User <-> Charlie
  const chat3 = await prisma.chat.create({
    data: {
      title: charlie.name,
      participants: {
        connect: [{ id: testUser.id }, { id: charlie.id }],
      },
    },
  });

  await prisma.message.createMany({
    data: [
      {
        content: 'Hey Charlie, are you free for a quick call?',
        senderId: testUser.id,
        chatId: chat3.id,
        createdAt: new Date('2024-01-13T09:00:00Z'),
      },
      {
        content: 'Sure! Give me 10 minutes.',
        senderId: charlie.id,
        chatId: chat3.id,
        createdAt: new Date('2024-01-13T09:05:00Z'),
      },
    ],
  });

  // Chat 4: Group chat with Test User, Bob, and Diana
  const chat4 = await prisma.chat.create({
    data: {
      title: 'Project Team',
      participants: {
        connect: [
          { id: testUser.id },
          { id: bob.id },
          { id: diana.id },
        ],
      },
    },
  });

  await prisma.message.createMany({
    data: [
      {
        content: 'Welcome to the project team chat!',
        senderId: testUser.id,
        chatId: chat4.id,
        createdAt: new Date('2024-01-16T08:00:00Z'),
      },
      {
        content: 'Thanks for adding me! Excited to work with you all!',
        senderId: diana.id,
        chatId: chat4.id,
        createdAt: new Date('2024-01-16T08:15:00Z'),
      },
      {
        content: 'Great to have you on board, Diana!',
        senderId: bob.id,
        chatId: chat4.id,
        createdAt: new Date('2024-01-16T08:20:00Z'),
      },
      {
        content: "Let's have our kickoff meeting tomorrow at 10 AM",
        senderId: testUser.id,
        chatId: chat4.id,
        createdAt: new Date('2024-01-16T09:00:00Z'),
      },
    ],
  });

  // Update chat updatedAt times based on last message
  await prisma.chat.update({
    where: { id: chat1.id },
    data: { updatedAt: new Date('2024-01-15T10:15:00Z') },
  });

  await prisma.chat.update({
    where: { id: chat2.id },
    data: { updatedAt: new Date('2024-01-14T15:00:00Z') },
  });

  await prisma.chat.update({
    where: { id: chat3.id },
    data: { updatedAt: new Date('2024-01-13T09:05:00Z') },
  });

  await prisma.chat.update({
    where: { id: chat4.id },
    data: { updatedAt: new Date('2024-01-16T09:00:00Z') },
  });

  console.log('✅ Chats and messages created');
  console.log('\n📊 Summary:');
  console.log(`   - Created/updated 5 users`);
  console.log(`   - Created 4 chats (3 one-on-one, 1 group)`);
  console.log(`   - Created 13 messages total`);
  console.log('\n👤 Test Users (all with password: password123):');
  console.log(`   - test@example.com (Test User)`);
  console.log(`   - alice@example.com (Alice Johnson)`);
  console.log(`   - bob@example.com (Bob Smith)`);
  console.log(`   - charlie@example.com (Charlie Brown)`);
  console.log(`   - diana@example.com (Diana Prince)`);
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
