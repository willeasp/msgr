import { PrismaClient } from '../generated/prisma/index.js';
import { directPair } from '../src/domain/chat.js';
import { UserId } from '../src/domain/user.js';
import { hashPassword } from '../src/infrastructure/password-hasher.js';

const PASSWORD = 'password123';

const people = {
  test: { email: 'test@example.com', name: 'Test User' },
  alice: { email: 'alice@example.com', name: 'Alice Johnson' },
  bob: { email: 'bob@example.com', name: 'Bob Smith' },
  charlie: { email: 'charlie@example.com', name: 'Charlie Brown' },
  diana: { email: 'diana@example.com', name: 'Diana Prince' },
};
type Person = keyof typeof people;

interface Conversation {
  /** Present for group chats; a chat without one is direct. */
  readonly title?: string;
  /** Present for channels, without the "#". */
  readonly channel?: string;
  readonly members: readonly Person[];
  readonly lines: readonly (readonly [Person, string, string])[];
}

const conversations: Conversation[] = [
  {
    channel: 'general',
    members: ['test', 'alice', 'bob', 'charlie', 'diana'],
    lines: [
      ['alice', '2024-01-17T09:00:00Z', 'Morning, everyone! 😀'],
      ['charlie', '2024-01-17T09:02:00Z', 'Who is up for lunch later?'],
      ['diana', '2024-01-17T09:05:00Z', 'Count me in.'],
    ],
  },
  {
    members: ['test', 'alice'],
    lines: [
      ['test', '2024-01-15T10:00:00Z', 'Hey Alice! How are you doing?'],
      [
        'alice',
        '2024-01-15T10:05:00Z',
        "Hi! I'm doing great, thanks for asking! How about you?",
      ],
      [
        'test',
        '2024-01-15T10:10:00Z',
        'Pretty good! Working on some exciting projects.',
      ],
      [
        'alice',
        '2024-01-15T10:15:00Z',
        'That sounds awesome! Tell me more about them!',
      ],
    ],
  },
  {
    members: ['test', 'bob'],
    lines: [
      ['test', '2024-01-14T14:00:00Z', 'Bob, did you see the latest updates?'],
      ['bob', '2024-01-14T14:30:00Z', 'Yes! They look amazing! Great work!'],
      [
        'test',
        '2024-01-14T15:00:00Z',
        'Thanks! Let me know if you have any feedback.',
      ],
    ],
  },
  {
    members: ['test', 'charlie'],
    lines: [
      [
        'test',
        '2024-01-13T09:00:00Z',
        'Hey Charlie, are you free for a quick call?',
      ],
      ['charlie', '2024-01-13T09:05:00Z', 'Sure! Give me 10 minutes.'],
    ],
  },
  {
    title: 'Project Team',
    members: ['test', 'bob', 'diana'],
    lines: [
      ['test', '2024-01-16T08:00:00Z', 'Welcome to the project team chat!'],
      [
        'diana',
        '2024-01-16T08:15:00Z',
        'Thanks for adding me! Excited to work with you all!',
      ],
      ['bob', '2024-01-16T08:20:00Z', 'Great to have you on board, Diana!'],
      [
        'test',
        '2024-01-16T09:00:00Z',
        "Let's have our kickoff meeting tomorrow at 10 AM",
      ],
    ],
  },
];

async function seed(db: PrismaClient) {
  const password = await hashPassword(PASSWORD);
  const ids = {} as Record<Person, UserId>;
  for (const [person, { email, name }] of Object.entries(people)) {
    const user = await db.user.upsert({
      where: { email },
      update: { name, password },
      create: { email, name, password },
    });
    ids[person as Person] = UserId(user.id);
  }

  await db.chat.deleteMany();

  for (const { title, channel, members, lines } of conversations) {
    const participantIds = members.map((member) => ids[member]);
    await db.chat.create({
      data: {
        ...(channel
          ? { channelName: channel }
          : title
          ? { title }
          : { directKey: directKeyOf(participantIds) }),
        participants: { connect: participantIds.map((id) => ({ id })) },
        messages: {
          create: lines.map(([sender, sentAt, content]) => ({
            senderId: ids[sender],
            content,
            createdAt: new Date(sentAt),
          })),
        },
        updatedAt: new Date(lines.at(-1)?.[1] ?? Date.now()),
      },
    });
  }

  console.log(
    `🌱 Seeded ${Object.keys(people).length} users and ${
      conversations.length
    } chats. ` +
      `Everyone's password is "${PASSWORD}":\n` +
      Object.values(people)
        .map(({ email, name }) => `   ${email} (${name})`)
        .join('\n')
  );
}

function directKeyOf(participantIds: readonly UserId[]) {
  const [first, second] = participantIds;
  const pair = first && second ? directPair(first, second) : null;
  if (participantIds.length !== 2 || !pair?.ok) {
    throw new Error(`A direct chat needs two different people`);
  }
  return pair.value.key;
}

const db = new PrismaClient();
try {
  await seed(db);
} finally {
  await db.$disconnect();
}
