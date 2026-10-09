# msgr

Real-time chat: a GraphQL API (`apps/api`) and a React client (`apps/frontend`) in an Nx workspace. Domain terms are defined in [CONTEXT.md](CONTEXT.md); use them in code, tests and commits.

## Commands

```bash
npm run dev                 # API on :4000, frontend on :4200 (needs `npm run db:start`)
npm run test                # every unit/integration test, run once; no database needed
(cd apps/api && npx vitest --watch)   # TDD loop: re-runs on save
npm run typecheck           # runs codegen first
npm run lint                # includes the API's layer rule (see below)
npm run codegen             # after any change to apps/api/src/graphql/schema.ts
npm run db:migrate          # after any change to apps/api/prisma/schema.prisma
npx nx test @msgr/api -- src/domain   # one folder / file
```

Repository contract tests against Postgres are opt-in. Point them at a **disposable, migrated** database, since every test truncates it:

```bash
TEST_DATABASE_URL='postgres://…&pgbouncer=true' npx nx test @msgr/api
```

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

1. `graphql/context.ts` authenticates the session token into a `viewer: User | null` and builds a fresh **scope**: services plus DataLoaders sharing one cache.
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

**Make illegal states unrepresentable.** `Chat = DirectChat | GroupChat`: a direct chat has exactly two participants and no title. Switch on `kind`; don't test `participants.length === 2`. The DB enforces the same invariant (`directKey` unique + CHECK constraint).

**Resolvers stay one-liners.** No Prisma, no rules, no hand-built objects in `graphql/`. Codegen `mappers` let resolvers return domain entities directly.

```ts
sendMessage: async (_, { input }, ctx) =>
  unwrap(await ctx.services.messages.send(requireViewer(ctx), input)),
```

**Repositories are batch-shaped.** Keyed reads take many ids and return what exists, in any order (`findByIds`, `findPages`). Single lookups go through `loaders`, which batch them.

**Privacy by indistinguishability.** A chat you're not in answers exactly like a missing one (`visibleTo`). Login failures are all `InvalidCredentials`, and unknown emails still pay for a hash check.

## Adding behaviour (TDD)

1. **Rule or value?** Write a failing test in `domain/*.test.ts`, then implement it as a pure function or `parse`. These tests are instant.
2. **Use case?** Write a failing test in `application/*.service.test.ts` with `createTestApp()` (in-memory adapters, fake hasher, ticking clock). Override any port to observe it: `createTestApp({ passwords: { verify } })`.
3. **New repository method?** Add it to the port in `application/ports.ts`, add its behaviour to `testing/repository-contract.ts`, and make both the in-memory and the Prisma adapter pass the contract. Run the Postgres contract before merging.
4. **New field?** Edit `graphql/schema.ts`, run `npm run codegen`, add a resolver, and cover it through `graphql/resolvers.test.ts`, which executes real operations against the schema.

Test through interfaces, not internals: assert on what a service, operation or repository returns. For new relations, assert query counts with `vi.spyOn(repositories.x, 'findByIds')`, as the chat-list test does.

## Gotchas

- Generated code is git-ignored: `apps/*/src/**/__generated__` (GraphQL codegen) and `apps/api/generated/prisma` (`npm run db:generate`). Never edit it.
- The frontend's codegen reads the API schema straight from `apps/api/src/graphql/schema.ts`.
- The frontend UI is built from Sacred Computer components vendored in `apps/frontend/src/sacred` (read its README before adding one), dressed as a black-and-white Macintosh by `apps/frontend/src/skin.css`. Style with CSS Modules and the skin's `--ink` / `--paper` / `--line` tokens; inversion is the only highlight. There is no Tailwind.
- `vitest.config.ts` aliases `graphql` to its CommonJS build. Two copies of graphql cannot share a schema.
- Subscriptions run over one in-process `PubSub`, so a single API instance. To scale out, pass a shared `PubSubEngine` to `createPubSubMessageEvents`.
- Subscription contexts live for many events, so their loaders batch but don't cache.
