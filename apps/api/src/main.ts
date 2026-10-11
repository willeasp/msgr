import { existsSync } from 'node:fs';
import { parseConfig } from './config.js';
import { startServer } from './graphql/server.js';
import { createPubSubMessageEvents } from './infrastructure/message-events.js';
import { createPubSubChatEvents } from './infrastructure/chat-events.js';
import { createPubSubProfileEvents } from './infrastructure/profile-events.js';
import { cachedLinkPreviewer } from './infrastructure/cached-link-previewer.js';
import { randomInviteCodes } from './infrastructure/invite-codes.js';
import { createLinkPreviewer } from './infrastructure/link-previewer.js';
import { createBcryptPasswordHasher } from './infrastructure/password-hasher.js';
import {
  createWebPushSender,
  noPushSender,
} from './infrastructure/push-sender.js';
import { PrismaClient } from './infrastructure/prisma/client.js';
import { prismaRepositories } from './infrastructure/prisma/repositories.js';
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

const db = new PrismaClient();
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
