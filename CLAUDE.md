# msgr

Invite-only, real-time chat dressed as a black-and-white Macintosh: a GraphQL API (`apps/api`) and a React client (`apps/frontend`) in an Nx workspace, shipped as one container, with browser tests in `apps/e2e`. Domain terms are defined in [CONTEXT.md](CONTEXT.md); use them in code, tests and commits. The big picture is in [docs/architecture.md](docs/architecture.md), and the reasons behind it in [docs/adr/](docs/adr/).

## Commands

```bash
npm run dev                 # API on :4000, frontend on :4200 (needs `npm run db:start`)
npm run test                # every unit/integration test, run once; no database needed
(cd apps/api && npx vitest --watch)   # TDD loop: re-runs on save
npm run typecheck           # runs codegen first
npm run lint                # includes the API's layer rule (see below)
npm run codegen             # after any change to apps/api/src/graphql/schema.ts
npm run db:migrate          # after any change to apps/api/prisma/schema.prisma
npm run invite              # print a single-use sign-up link (the first account starts here)
npm run e2e                 # build, then Playwright against the production build (needs the test Postgres below)
npx nx test @msgr/api -- src/domain   # one folder / file
```

Repository contract tests against Postgres are opt-in (CI always runs them). Point them at a **disposable, migrated** database, since every test truncates it:

```bash
docker run -d --name msgr-test-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=msgr_test -p 55432:5432 postgres:17-alpine
export TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/msgr_test
DATABASE_URL=$TEST_DATABASE_URL npm --workspace=@msgr/api exec prisma migrate deploy
npx nx test @msgr/api
```

The e2e suite (`apps/e2e`) uses the same server but its own database: every run drops and recreates `msgr_e2e` there, migrates and seeds it, and touches nothing else. Point it at another server with `E2E_POSTGRES_URL` (any database on it). It can't use Prisma dev, which holds a single database.

## API architecture: functional core, imperative shell

```
apps/api/src/
  domain/          pure types + rules. No I/O, no frameworks, no async.
  application/     use cases (services), ports, request-scoped DataLoaders
  infrastructure/  adapters for the ports: Prisma, bcrypt, jose, PubSub
  graphql/         transport: schema, resolvers, context, error mapping, server
  testing/         in-memory adapters, repository contract, test harness
  main.ts          composition root: the only file that picks adapters
  config.ts        env → typed Config, validated once at boot
```

**Dependency rule** (enforced by ESLint in `apps/api/eslint.config.mjs`): `domain` ← `application` ← `infrastructure` / `graphql`. Inner layers never import outer ones.

### How a request flows

1. `graphql/context.ts` authenticates the session token into a `viewer: User | null` and builds a fresh **scope**: services plus DataLoaders sharing one cache. `login` and `signUp` call `startSession(ctx, session)`, which sets the cookie and makes the new user the viewer for the rest of that operation, so their payload's nested fields resolve.
2. **Root fields** authorize with `requireViewer(ctx)` and delegate to a service. Services return `Result<T, DomainError>`; `unwrap` turns errors into GraphQL errors (`graphql/errors.ts` is the only mapping).
3. **Nested fields** (`Chat.participants`, `Message.sender`, …) only walk relations of something already authorized, always through `ctx.loaders`. One batch per relation per query, never N+1.

## Conventions

**Parse, don't validate.** Raw input becomes a branded type exactly once, at the service boundary. Downstream code takes the brand and never re-checks it.

```ts
// domain/message.ts
export type MessageContent = Brand<string, 'MessageContent'>;
export const MessageContent = {
  parse(raw: string): Result<MessageContent, InvalidInput> { … },
};
```

**Expected failures are values; defects throw.** If a caller must handle it (bad input, not found, wrong password), return `err(...)` with a `DomainError`. If it means the system is broken (dangling FK, DB down), `throw`. Never `throw new Error('Not authenticated')` from a service.

```ts
// application/message.service.ts
const content = MessageContent.parse(input.content);
if (!content.ok) return content;
const chat = visibleTo(await loaders.chat.load(ChatId(input.chatId)), viewer.id);
if (!chat.ok) return chat;
```

**Make illegal states unrepresentable.** `Chat = DirectChat | GroupChat | ChannelChat`: a direct chat has exactly two participants and no title; a channel has a name. Switch on `kind`; don't test `participants.length === 2`. The DB enforces the same invariant: exactly one of `directKey`, `title` and `channelName` is set (CHECK constraint), and `directKey` and `channelName` are unique.

**Resolvers stay one-liners.** No Prisma, no rules, no hand-built objects in `graphql/`. Codegen `mappers` let resolvers return domain entities directly.

```ts
sendMessage: async (_, { input }, ctx) =>
  unwrap(await ctx.services.messages.send(requireViewer(ctx), input)),
```

**Repositories are batch-shaped.** Keyed reads take many ids and return what exists, in any order (`findByIds`, `findPages`). Single lookups go through `loaders`, which batch them.

**Privacy by indistinguishability.** A chat you're not in answers exactly like a missing one (`visibleTo`). Login failures are all `InvalidCredentials`, and unknown emails still pay for a hash check.

## Frontend architecture

```
apps/frontend/src/
  app/pages/       routes: chat (the desktop), login, sign-up (/invite/:code), not-found
  app/components/  Mac chrome (MenuBar, MacWindow, MacDialog, PixelIcon), chat/ windows and dialogs
  app/hooks/       useChatFeed (the live subscriptions), useAlerts, useClock, useMediaQuery
  lib/             pure logic, each with a test: theme, alerts, commands, chat-list, pixels
  sacred/          vendored Sacred Computer components (read its README first)
  skin.css         the Macintosh skin over them
```

- **One live feed.** The chat page owns the only subscriptions (`useChatFeed`): `messageReceived` updates the chat list and each chat's cached history, open or not, and hands every message to `useAlerts`; `chatAdded` puts a chat that now includes the viewer (an invitee signed up, or someone added them to a channel) on the list and rings for it. Windows only query. Opening a chat also refetches its history (`cache-and-network`), so anything missed while offline appears.
- **Session changes** (sign in, sign up, log out) go through `useSessionChange`, which clears Apollo's cache before navigating. Everything cached, down to `me: null`, belongs to the previous viewer; without the reset, signing in after being redirected to `/login` bounces straight back there.
- **Dialogs** go through Sacred's modal stack: `useModals().open(Component, props)`.
- **Logic out of components.** Anything decidable without the DOM goes in `lib/*.ts` with a test (`shouldAlert`, `parseCommand`, `withReceivedMessage`, `identicon`); components wire it up.
- **Styling.** CSS Modules plus the skin's tokens: `--ink`, `--paper`, `--line` (one text line), `--dither`, `--font-family-chrome` (Chicago, for the system's words), `--font-family-mono` (Departure Mono, for people's). Inversion is the only highlight. Vendored Sacred components are restyled only from `skin.css`, by their stable `srcl-<Component>__<class>` names.

## Security invariants

Keep these true; [SECURITY.md](SECURITY.md) explains the model.

- **The session lives only in the httpOnly `token` cookie.** Never put it in storage JavaScript can read; the frontend doesn't even select `token` from `login` or `signUp`.
- **One origin.** The API serves the app (`STATIC_DIR`) and Vite proxies `/graphql` in development, so the cookie authenticates HTTP and WebSocket alike. WebSockets opened by any other site are refused in `onConnect`, which is why `CORS_ORIGIN` must be the public address.
- **No inline scripts.** The CSP forbids them; put boot code in `apps/frontend/public/*.js`.
- **Never expose a `Chat` the viewer isn't in.** `Chat` fields walk messages and participants. A listing of chats beyond the viewer's own needs its own type without them, as `ChannelListing` does.
- **Invites are secrets.** Store only their SHA-256 hash; redeem atomically (claim the invite, create the user and link them in one transaction). Reject a bad code before paying for bcrypt.
- **Throttle guessing.** `login` counts attempts per email through the `Throttle` port.

## Deploying

The root `Dockerfile` builds both apps into one image that runs `prisma migrate deploy` and then the API, which serves the app. `render.yaml` deploys it to Render's free plan; the README walks through it. The Prisma CLI is therefore a runtime dependency of `@msgr/api`, not a dev one.

## Adding behaviour (TDD)

1. **Rule or value?** Write a failing test in `domain/*.test.ts`, then implement it as a pure function or `parse`. These tests are instant.
2. **Use case?** Write a failing test in `application/*.service.test.ts` with `createTestApp()` (in-memory adapters, fake hasher, ticking clock). Override any port to observe it: `createTestApp({ passwords: { ...fakePasswordHasher, verify } })`.
3. **New repository method?** Add it to the port in `application/ports.ts`, add its behaviour to `testing/repository-contract.ts`, and make both the in-memory and the Prisma adapter pass the contract. Run the Postgres contract before merging.
4. **New field?** Edit `graphql/schema.ts`, run `npm run codegen`, add a resolver, and cover it through `graphql/resolvers.test.ts`, which executes real operations against the schema.
5. **Something on screen?** Add a Playwright spec to `apps/e2e/tests` and run `npm run e2e`. Find things the way a person would, by role, label and text, with the helpers in `tests/support.ts` (`signIn`, `chooseMenu`, `chatWindow`, `anotherPerson` for a second browser). The seed data is there at the start of each run; the specs share one server, so make what you need rather than relying on another spec's leftovers. Every login counts toward the throttle (10 per email per 15 minutes, successful ones too), so spread sign-ins across the seeded accounts.

Test through interfaces, not internals: assert on what a service, operation or repository returns. For new relations, assert query counts with `vi.spyOn(repositories.x, 'findByIds')`, as the chat-list test does.

## Gotchas

- Generated code is git-ignored: `apps/*/src/**/__generated__` (GraphQL codegen) and `apps/api/generated/prisma` (`npm run db:generate`). Never edit it.
- The frontend's codegen reads the API schema straight from `apps/api/src/graphql/schema.ts`.
- The frontend UI is built from Sacred Computer components vendored in `apps/frontend/src/sacred` (read its README before adding one), dressed as a black-and-white Macintosh by `apps/frontend/src/skin.css`. Style with CSS Modules and the skin's `--ink` / `--paper` / `--line` tokens; inversion is the only highlight. There is no Tailwind.
- `vitest.config.ts` aliases `graphql` to its CommonJS build. Two copies of graphql cannot share a schema.
- Subscriptions run over one in-process `PubSub`, so a single API instance. To scale out, pass a shared `PubSubEngine` to `createPubSubMessageEvents` and `createPubSubChatEvents`.
- Subscription contexts live for many events, so their loaders batch but don't cache.
- The login throttle is in-process memory too: it resets on restart and isn't shared between instances.
- `prisma migrate dev` refuses to run non-interactively when it wants a confirmation (a new unique index, say). Generate the SQL instead: `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <empty db> --script`, then append any hand-written SQL such as CHECK constraints.
- Joining and leaving a channel connect through the _user's_ side of the relation, so the chat's `updatedAt`, its activity, doesn't change.
- The frontend's GraphQL codegen scans `src/**/*.{ts,tsx}`; operations can live in hooks.
- Prettier ignores `apps/frontend/src/sacred`, which keeps upstream's formatting.
