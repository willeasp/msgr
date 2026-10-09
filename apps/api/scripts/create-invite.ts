// Prints a single-use sign-up link. Nobody can invite anyone before someone
// exists, so the first account starts here: `npm run invite`.
import { existsSync } from 'node:fs';
import { newInvite } from '../src/domain/invite.js';
import { randomInviteCodes } from '../src/infrastructure/invite-codes.js';
import { PrismaClient } from '../src/infrastructure/prisma/client.js';
import { prismaInviteRepository } from '../src/infrastructure/prisma/invite.repository.js';

const envFile = new URL('../.env', import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

const db = new PrismaClient();
const invite = newInvite(randomInviteCodes(), null, new Date());
await prismaInviteRepository(db).create(invite);
await db.$disconnect();

const site = process.env['CORS_ORIGIN'] ?? 'http://localhost:4200';
console.log(
  `✉️  Invite link, single use, valid until ${invite.expiresAt.toUTCString()}:\n` +
    `   ${site}/invite/${invite.code}`
);
