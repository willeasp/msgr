# msgr

Invite-only, real-time chat dressed as a black-and-white Macintosh: a GraphQL API (`apps/api`) and a React client (`apps/frontend`) in an Nx workspace, shipped as one container, with browser tests in `apps/e2e`. Domain terms are defined in [CONTEXT.md](CONTEXT.md); use them in code, tests and commits. The big picture is in [docs/architecture.md](docs/architecture.md), and the reasons behind it in [docs/adr/](docs/adr/).

## Commands

```bash
npm run dev                 # applies pending migrations, then API on :4000, frontend on :4200 (needs `npm run db:start`)
npm run test                # every unit/integration test, run once; no database needed
(cd apps/api && npx vitest --watch)   # TDD loop: re-runs on save
npm run typecheck           # runs codegen first
npm run lint                # includes the API's layer rule (see below)
npm run codegen             # after any change to apps/api/src/graphql/schema.ts
npm run db:migrate          # after any change to apps/api/prisma/schema.prisma
npm run invite              # print a single-use sign-up link (the first account starts here)
npm run e2e                 # build, then Playwright against the production build (needs the test Postgres below)
npm run screenshots         # the same, remaking the README's pictures in docs/screenshots
npx nx test @msgr/api -- src/domain   # one folder / file
```

Repository contract tests against Postgres are opt-in (CI always runs them). Point them at a **disposable, migrated** database, since every test truncates it:

```bash
docker run -d --name msgr-test-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=msgr_test -p 55432:5432 postgres:18-alpine
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

**Make illegal states unrepresentable.** `Chat = DirectChat | GroupChat | ChannelChat`: a direct chat has exactly two participants and no title; a channel has a name. Switch on `kind`; don't test `participants.length === 2`. The DB enforces the same invariant: exactly one of `directKey`, `title` and `channelName` is set (CHECK constraint), and `directKey` and `channelName` are unique. Likewise a message's body is `{ content, picture: Picture | null } | { content: null, picture }`: text, a picture, or both, never neither; the DB checks the same.

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
  app/hooks/       useChatFeed (the live subscriptions), useAlerts, useNotifications, useWatching, useInstallPrompt, useClock (the one clock), useMediaQuery
  lib/             pure logic, each with a test: theme, alerts, push, commands, chat-list, pixels, paint, emoji, links, photo, picture-wire
  sacred/          vendored Sacred Computer components (read its README first)
  skin.css         the Macintosh skin over them
```

- **One live feed.** The chat page owns the only subscriptions (`useChatFeed`): `messageReceived` updates the chat list and each chat's cached history, open or not, and hands every message to `useAlerts`, which beeps and counts unread messages in the tab; `chatAdded` puts a chat that now includes the viewer (an invitee signed up, or someone added them to a channel) on the list and rings for it. Windows only query. Every message enters the cache through `recordMessage`, the feed's and the viewer's own sends alike, so the chat list and the history can't disagree; `sendMessage` selects everything the feed does. The socket retries forever (phones drop it when they sleep) and refetches every active query when it returns, since events sent meanwhile are lost. Opening a chat also refetches its history (`cache-and-network`).
- **One clock.** `useClock` is the page's only "now": the menu bar and every "5m ago" read it (`formatTime(date, now)` has no clock of its own), and it re-reads the device's time on waking, when timers have been paused.
- **Notifications come by Web Push**, open or not ([ADR 0006](docs/adr/0006-web-push-for-notifications.md)). `useNotifications` turns them on and off, and re-registers the browser for whoever is signed in on every visit. `useWatching` tells the server which chat is on screen, so that chat doesn't notify. The page never shows a notification itself.
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
- **Push only to push services.** The server POSTs wherever a push endpoint points, so `PushSubscription.parse` (`domain/push.ts`) accepts only the browser vendors' push hosts. Never loosen it.
- **A browser notifies one user at a time.** Logging out removes it (`disablePush`, while still signed in), and every visit re-registers it for whoever is signed in.

## Deploying

The root `Dockerfile` builds both apps into one image that runs `prisma migrate deploy` and then the API, which serves the app. `render.yaml` deploys it to Render's free plan, next to a Neon database; [docs/deploying.md](docs/deploying.md) walks through it. The Prisma CLI is therefore a runtime dependency of `@msgr/api`, not a dev one.

## Adding behaviour (TDD)

1. **Rule or value?** Write a failing test in `domain/*.test.ts`, then implement it as a pure function or `parse`. These tests are instant.
2. **Use case?** Write a failing test in `application/*.service.test.ts` with `createTestApp()` (in-memory adapters, fake hasher, ticking clock). Override any port to observe it: `createTestApp({ passwords: { ...fakePasswordHasher, verify } })`.
3. **New repository method?** Add it to the port in `application/ports.ts`, add its behaviour to `testing/repository-contract.ts`, and make both the in-memory and the Prisma adapter pass the contract. Run the Postgres contract before merging.
4. **New field?** Edit `graphql/schema.ts`, run `npm run codegen`, add a resolver, and cover it through `graphql/resolvers.test.ts`, which executes real operations against the schema.
5. **Something on screen?** Add a Playwright spec to `apps/e2e/tests` and run `npm run e2e`. Find things the way a person would, by role, label and text, with the helpers in `tests/support.ts` (`signIn`, `chooseMenu`, `chatWindow`, `anotherPerson` for a second browser). The seed data is there at the start of each run; the specs share one server, so make what you need rather than relying on another spec's leftovers. Every login counts toward the throttle (10 per email per 15 minutes, successful ones too), so spread sign-ins across the seeded accounts. If the change shows in the README's pictures, run `npm run screenshots`, look at the results and commit them; `apps/e2e/screenshots/readme.spec.ts` takes them with the clock fixed just after the seed's last messages.

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
- Link previews are fetched by `infrastructure/link-previewer.ts`, behind `isPublicAddress` and the other guards in SECURITY.md, and cached in memory (`cached-link-previewer.ts`). Its tests pass their own `isAllowed` and `ports` to reach a local server; never loosen the defaults. The e2e answers the `LinkPreview` query itself (`page.route`), so CI never fetches real sites.
- Push needs VAPID keys. Development uses its own pair (`config.ts`); production without `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` runs with push off. Push services refuse an `http:` VAPID subject, so pushes are signed with the app's address only when it's `https`, and with a `mailto:` otherwise.
- `public/sw.js` is plain JavaScript, served as-is. It must show every push: iOS revokes the subscription of a site whose pushes show nothing. That's why the server skips the chat someone is watching (`Watching`, in process memory like the `PubSub`).
- Playwright's Chromium can't reach a push service, and headless it says `Notification.permission` is `"denied"` whatever it's granted. The e2e fakes the permission and covers the offer; real delivery works in Playwright's Firefox, through Mozilla's push service, with the prefs `dom.push.serverURL: 'wss://push.services.mozilla.com/'` and `permissions.default.desktop-notification: 1`. Phones are tested by hand (`docs/manual-testing.md`, section 7).
- The e2e config presets `notifications-dismissed` for every browser, so the notifications offer stays out of the way. To see the offer, make a context with `storageState: { cookies: [], origins: [] }`, as `notifications.spec.ts` does.
- The chat list's identicons come from chat ids, which change with every seed, so `npm run screenshots` always changes those avatars a little. Commit new pictures only when something else changed.
- `libs/bitmap` (`@msgr/bitmap`) holds what the API and the app share about 1-bit pictures: the bit layout, Atkinson's dithering and strict base64. Keep it pure, with neither DOM nor Node types. Tests and Vite read its source through an alias; the API's unbundled build runs its compiled `dist`, so `nx` builds it first and the image copies it. A picture travels and is stored raw-DEFLATEd: the browser compresses with `CompressionStream`, and the server inflates under an exact cap (`zlib-picture-codec.ts`) and compresses again itself.
- Emoji are dithered from each device's own font (`lib/emoji.ts`, drawn by `PixelText`), so they differ a little between a Mac and a phone. They are dithered at 32×32 (`SIZE`) and drawn 16 px tall. To replace one that comes out badly, add a 16×16 bitmap to `lib/emoji-art.ts`. Text that people write goes through `PixelText` wherever it's shown.
