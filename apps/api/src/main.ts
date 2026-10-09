import { existsSync } from 'node:fs';
import { parseConfig } from './config.js';
import { startServer } from './graphql/server.js';
import { createPubSubMessageEvents } from './infrastructure/message-events.js';
import { randomInviteCodes } from './infrastructure/invite-codes.js';
import { createBcryptPasswordHasher } from './infrastructure/password-hasher.js';
import { PrismaClient } from './infrastructure/prisma/client.js';
import { prismaRepositories } from './infrastructure/prisma/repositories.js';
import { createMemoryThrottle } from './infrastructure/throttle.js';
import { createJwtTokenService } from './infrastructure/token-service.js';

// The composition root: the only place that knows which adapter fills which port.

const envFile = new URL('../.env', import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

const config = parseConfig(process.env);
if (!config.ok) {
  console.error(`Invalid configuration:\n  - ${config.error.join('\n  - ')}`);
  process.exit(1);
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
    clock,
    inviteCodes: randomInviteCodes,
    // Ten tries per email every fifteen minutes is plenty for a person and
    // hopeless for someone guessing passwords.
    throttle: createMemoryThrottle({
      limit: 10,
      windowMs: 15 * 60 * 1000,
      clock,
    }),
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
