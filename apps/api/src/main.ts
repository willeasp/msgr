import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseConfig } from './config.js';
import { startServer } from './graphql/server.js';
import { createPubSubMessageEvents } from './infrastructure/message-events.js';
import { createPubSubChatEvents } from './infrastructure/chat-events.js';
import { createPubSubProfileEvents } from './infrastructure/profile-events.js';
import { createPubSubTypingEvents } from './infrastructure/typing-events.js';
import { cachedLinkPreviewer } from './infrastructure/cached-link-previewer.js';
import { randomInviteCodes } from './infrastructure/invite-codes.js';
import { createLinkPreviewer } from './infrastructure/link-previewer.js';
import { createBcryptPasswordHasher } from './infrastructure/password-hasher.js';
import {
  createWebPushSender,
  noPushSender,
} from './infrastructure/push-sender.js';
import { PrismaClient } from './infrastructure/prisma/client.js';
import { migrate } from './infrastructure/prisma/migrations.js';
import { prismaRepositories } from './infrastructure/prisma/repositories.js';
import { prismaStorageGauge } from './infrastructure/prisma/storage-gauge.js';
import { createMemoryThrottle } from './infrastructure/throttle.js';
import { createJwtTokenService } from './infrastructure/token-service.js';
import { createMemoryWatching } from './infrastructure/watching.js';
import { zlibPictureCodec } from './infrastructure/zlib-picture-codec.js';

// The composition root: the only place that knows which adapter fills which port.

const envFile = new URL('../.env', import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

const config = parseConfig(process.env);
if (!config.ok) {
  console.error(`Invalid configuration:\n  - ${config.error.join('\n  - ')}`);
  process.exit(1);
}

const push = config.value.push;
if (!push) {
  console.warn(
    'Push notifications are off: set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to turn them on.'
  );
}

/** Milliseconds since the process started, to see where a wake's time goes. */
const since = () => `${Math.round(performance.now())} ms`;
const prisma = (path: string) =>
  fileURLToPath(new URL(`../prisma/${path}`, import.meta.url));

const db = new PrismaClient();
// Brings the database up to date while the server already answers: the app
// and /healthz at once, GraphQL as soon as this is done.
const ready = migrate(db, {
  dir: prisma('migrations'),
  schema: prisma('schema.prisma'),
});
ready.then(
  (applied) =>
    console.log(
      applied.length > 0
        ? `Applied ${applied.join(', ')} (${since()})`
        : `Database up to date (${since()})`
    ),
  (error: unknown) => {
    console.error('Could not bring the database up to date:', error);
    process.exit(1);
  }
);

const clock = () => new Date();
const server = await startServer(
  {
    repositories: prismaRepositories(db),
    passwords: createBcryptPasswordHasher(),
    tokens: createJwtTokenService({
      secret: config.value.jwtSecret,
      ttlSeconds: config.value.sessionTtlSeconds,
    }),
    events: createPubSubMessageEvents(),
    chatEvents: createPubSubChatEvents(),
    profileEvents: createPubSubProfileEvents(),
    typingEvents: createPubSubTypingEvents(),
    clock,
    inviteCodes: randomInviteCodes,
    // Ten tries per email every fifteen minutes is plenty for a person and
    // hopeless for someone guessing passwords.
    throttle: createMemoryThrottle({
      limit: 10,
      windowMs: 15 * 60 * 1000,
      clock,
    }),
    linkPreviewer: cachedLinkPreviewer(createLinkPreviewer(), clock),
    pictures: zlibPictureCodec,
    pushSender: push ? createWebPushSender(push) : noPushSender,
    pushKey: push?.publicKey ?? null,
    watching: createMemoryWatching(),
    admins: config.value.admins,
    storageGauge: prismaStorageGauge(db),
    storageLimit: config.value.storageLimit,
  },
  config.value
);
console.log(`🚀 GraphQL (HTTP + WebSocket) ready at ${server.url}`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    await server.stop();
    await db.$disconnect();
    process.exit(0);
  });
}
