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
npm run measure             # the same, printing what using a chat costs: renders, main-thread time, layouts, memory
node apps/frontend/scripts/bundle.mjs   # after a build: what a first visit downloads (`--check` holds it to its budget, as CI does)
npx nx test @msgr/api -- src/domain   # one folder / file
```

Repository contract tests against Postgres are opt-in (CI always runs them). Point them at a **disposable, migrated** database, since every test truncates it:

```bash
docker run -d --name msgr-test-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=msgr_test -p 55432:5432 postgres:18-alpine
export TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/msgr_test
DATABASE_URL=$TEST_DATABASE_URL npm --workspace=@msgr/api exec prisma migrate deploy
npx nx test @msgr/api
```

Every test against that database lives in one file, `infrastructure/prisma/repositories.test.ts`: Vitest runs files side by side, and two files truncating the same database wipe each other's rows. Add a `describe` there rather than a new file.

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

**Dependency rule** (enforced by ESLint in `apps/api/eslint.config.mjs`): `domain` ← `application` ← `infrastructure` / `graphql`. Inner layers never import outer ones, and `infrastructure` and `graphql` never import each other: only `main.ts` picks adapters.

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

**Make illegal states unrepresentable.** `Chat = DirectChat | GroupChat | ChannelChat`: a direct chat has exactly two participants and no title; a channel has a name. Switch on `kind`; don't test `participants.length === 2`. The DB enforces the same invariant: exactly one of `directKey`, `title` and `channelName` is set (CHECK constraint), and `directKey` and `channelName` are unique. Likewise a message's body is text, a picture, a movie or a sound, or text with one of them: `content` is null only when exactly one of `picture`, `movie` and `sound` is set, and two are never set; the DB checks the same.

**Resolvers stay one-liners.** No Prisma, no rules, no hand-built objects in `graphql/`. Codegen `mappers` let resolvers return domain entities directly.

```ts
sendMessage: async (_, { input }, ctx) =>
  unwrap(await ctx.services.messages.send(requireViewer(ctx), input)),
```

**Repositories are batch-shaped.** Keyed reads take many ids and return what exists, in any order (`findByIds`, `findPages`, `findMedia`). Single lookups go through `loaders`, which batch them.

**Bytes travel once** ([ADR 0012](docs/adr/0012-media-has-its-own-address.md)). A kept `Message` holds its picture's, movie's or sound's size; their bytes come only from `findMedia` (the `media` loader). The schema gives each its `url` (`graphql/media.ts`: `/media/:messageId/:part`, `/avatars/:userId/:version`), served raw to whoever may see it and kept by the browser a year, for that session alone (`Vary: Cookie`; logging out clears the cache); `bits` is deprecated. Pages take a `before` or `after` cursor rather than an offset.

**Privacy by indistinguishability.** A chat you're not in answers exactly like a missing one (`visibleTo`). Login failures are all `InvalidCredentials`, and unknown emails still pay for a hash check.

## Frontend architecture

```
apps/frontend/src/
  main.tsx, app/app.tsx  boot and routes: the composition root
  app/pages/       routes: chat (the desktop), admin (/admin, storage), login, sign-up (/invite/:code), not-found
  app/components/  what's on screen: Mac chrome (MenuBar, MacWindow, MacDialog, PixelIcon, SignedIn: the layout of every signed-in route), chat/ windows and dialogs
  app/hooks/       React state and effects: useSignedIn / useChatOnScreen (what every signed-in view shares), useChatFeed (the live subscriptions), useAlerts, useNotifications, useWatching, useTypists / useSayTyping, useReading, useJoinChannel, useSessionChange, useInstallPrompt, useRestartToUpdate, useOnline, useMedia / useMediaRetry (pictures, movies and sounds by address), useClock (the one clock), useMovie (the movies' one timer), useSoundPlayer (the page's one sound playing), useMediaQuery
  app/data/        the Apollo client (client.ts), and GraphQL several modules share: the chat list, a chat's header and history, the viewer (me, and whether they're an admin); the only cache writes, recordMessage and recordChat; and media fetched from their addresses (media.ts)
  app/browser/     the only code touching the browser's devices, decoders and storage: audio (lib/audio's rules), picture-, video- and sound-file readers, the emoji font, the theme, storage (every localStorage key), the service worker
  lib/             pure logic, each with a test, and no browser: theme, alerts, push, commands, chat-list, files, pixels, paint, emoji, links, photo, picture-wire, movie, movie-wire, sound, sound-wire, trim, time, cache, typing, info, audio, attachment, storage-report, connection, once, loading
  sacred/          vendored Sacred Computer components (read its README first)
  skin.css         the Macintosh skin over them
```

**Import rule** (enforced by ESLint in `apps/frontend/eslint.config.mjs`, [ADR 0010](docs/adr/0010-frontend-layers.md)): `pages` → `components` → `hooks` → `data`, `browser` → `lib`. Each imports only what's to its right; `data` and `browser` never import each other; `lib` imports no React and touches no `document`, `window` or `navigator`. Storage, Web Audio, `MediaRecorder`, `createImageBitmap`, `navigator.mediaDevices` and off-screen canvases or videos are errors outside `app/browser/`.

**Where new code goes.**

| It…                                                                  | Goes in                                                                                         |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| decides something without the DOM: a rule, a parse, a format         | `lib/`, with a test                                                                             |
| touches a browser API (storage, devices, decoding, the page's theme) | `app/browser/`; its rules in `lib/` behind a port when there are rules to test (`lib/audio.ts`) |
| is a GraphQL operation one component uses                            | beside that component                                                                           |
| is a GraphQL operation or cache write several modules use            | `app/data/`                                                                                     |
| holds React state or effects for more than one component             | `app/hooks/`                                                                                    |
| draws something                                                      | `app/components/`                                                                               |
| is a route                                                           | `app/pages/`                                                                                    |

A folder of one kind of thing is fine; a folder named for a topic (`auth/`, `utils/`) isn't. If none of these fits, the shape needs a decision: write an ADR, rather than a file at the top of `app/`.

- **Signed-in views are only views.** Every signed-in route is a child of `SignedIn` (`app/components/SignedIn.tsx`), which keeps everything that lasts while someone is signed in: the live feed, alerts, typists, the notifications offer and their links, and the admin flag. A view draws itself, its `AppNavigation` (adding only its own File items) and nothing else, so adding one can't stop the feed. Which chat is on screen, so it neither beeps nor notifies, is said by the chat window itself (`useChatOnScreen`), not by the route. Views read the shared state through `useSignedIn` (`app/hooks/use-signed-in.ts`).
- **The shell opens without the server** ([ADR 0011](docs/adr/0011-the-shell-is-kept-chats-are-not.md)). `public/sw.js` keeps the built app (never chats) and answers every page load from it; the build writes in its `VERSION` and `SHELL`. Only `me: null` is signed out (`sessionOf`): `SignedIn` shows `Connecting` until the server answers, with Try Again and Sign In Again… if it answers with an error, and queries that never reached a server able to answer are retried with backoff (`isWorthRetrying`, `lib/connection.ts`), never mutations. A new version takes over at once and offers Special → Restart to Update. The API changes in two steps, deprecate then remove, since a kept shell may be one version behind.
- **One live feed.** `SignedIn` owns the only subscriptions (`useChatFeed`): `messageReceived` updates the chat list and each chat's cached history, open or not, and hands every message to `useAlerts`, which beeps and counts unread messages in the tab; `chatAdded` puts a chat that now includes the viewer (an invitee signed up, or someone added them to a channel) on the list and rings for it; `typing` tells `useTypists` who is writing where. Windows only query. Every message enters the cache through `recordMessage` (`app/data/chats.ts`), the feed's and the viewer's own sends alike, so the chat list and the history can't disagree; `sendMessage` selects everything the feed does. The socket retries forever (phones drop it when they sleep) and refetches every active query when it returns, since events sent meanwhile are lost. Opening a chat also refetches its history (`cache-and-network`).
- **Media comes by address** ([ADR 0012](docs/adr/0012-media-has-its-own-address.md)). Operations select a picture's, movie's or sound's size and `url`, never `bits`. `app/data/media.ts` fetches each address once a session and keeps it decoded (`pictures`, `movies`, `sounds`, on `lib/once.ts`), so one already here shows at once; the browser keeps the bytes for later visits. Views read them through `useMedia` (`usePicture`, `useMovie`, `useSoundCodes`), which fetches only once a picture or movie nears the screen. Only the server's own bytes are taken: a failure (offline, a 5xx, a 404, a page in their place) is asked again when the network, the page or the socket comes back (`useMediaRetry`, `retryMedia`), never in a loop. What the viewer sends or saves is kept as they made it (`keep`, in the mutation's cache update), wins over any fetch of it, and is never fetched back. A session change forgets it all (`forgetMedia`).
- **People are cached once.** Apollo keeps each `User` by id, so `profileChanged` (a new name or avatar) reaches every message, row and menu bar that shows them with no handler. A direct chat's `title` is derived from its `counterpart` by a type policy (`lib/cache.ts`), so it follows too: select `counterpart` wherever you select `title`. A message's `movie` is merged, so the chat list can select just `movie { frames }` beside the history's whole movie.
- **Movies loop like GIFs**, with nothing to press. Every movie on the page steps together on one timer at 8 frames a second that stands still while the page is hidden or the viewer prefers reduced motion; it's no clock, so it isn't `useClock`. A movie steps by painting (`useMovieSteps`), never by rendering, and every 1-bit canvas is painted by `paintBits` (`use-bitmap-canvas.ts`): one pass into an `ImageData` it keeps (`fillPixels`, `lib/pixels.ts`) and one `putImageData`, in the canvas's CSS ink and paper, read once per theme. A movie shows exactly as a picture does (`MessagePicture.module.css`). What's drawn over one is a `Drawing` (ink and where) kept apart until it's sent, then drawn into every frame (`drawnOver`).
- **One audio.** Every sound, recording and alert beep goes through `audio` (`app/browser/audio.ts`), the browser's devices under the rules in `lib/audio.ts`: it is idle, playing, asking for the microphone or recording, and only `play`, `stop`, `record`, `beep` and `away` change it. A sound never plays and the beep never sounds while the microphone is asked for or recording; what iOS is told (`sessionFor`) follows from the state alone; whatever a state holds (the sound playing, the open microphone) is let go by every transition out of it. `record` returns a `Recording` at once, so a dialog that closes while the browser is still asking cancels it and the microphone goes straight back. Never call Web Audio, `getUserMedia` or `navigator.audioSession` anywhere else; add to `AudioDevices` and its test instead. Decoding a picked file (`app/browser/sound-file.ts`) is not playing, and needs none of this.
- **Sounds play when pressed**, one at a time page-wide: `useSoundPlayer` gives each player its own playback, starting one stops any other, and a player that goes (sent, its window closed) stops its sound. They play from samples made on first play (`synthesizeSound`); a message's sound decodes once near the screen, and its shape is read from the codes' loudness alone (`soundPeaks`). `SoundDialog` records or reads a file at 8,000 samples a second (`decodeAudioData` resamples), chooses up to a minute on the same `Timeline` as movies, and its Play plays the part squashed, exactly as it will be sent.
- **One clock.** `useClock` is the page's only "now": the menu bar and every "5m ago" read it (`formatTime(date, now)` has no clock of its own), and it re-reads the device's time on waking, when timers have been paused. Typing notices aren't times on screen: they expire on `useTypists`' own timer, since the clock ticks only on the minute.
- **Typing** shows in the chat window's title bar (`MacWindow`'s `status`, across the stripes from the close box): the classic wristwatch, stepping on `useMovieTick` and still when movies are, and "Ana is typing…". Too narrow for both, it takes the title's place. The composer says so every few seconds while there's text (`useSayTyping`), and the writer's message ends it at once.
- **Get Info and reads.** A click or tap on a message opens `GetInfoDialog` (not on a link, nor after dragging over its words); the bubble inverts while it's pressed, by `[data-pressable]` in `skin.css`. A chat open on a visible page is read up to its newest message (`useReading`, the same visibility rule as `useWatching`). Get Info polls while it's open; reads aren't live.
- **Notifications come by Web Push**, open or not ([ADR 0006](docs/adr/0006-web-push-for-notifications.md)). `useNotifications` turns them on and off, and re-registers the browser for whoever is signed in on every visit. `useWatching` tells the server which chat is on screen, so that chat doesn't notify. The page never shows a notification itself.
- **Session changes** (sign in, sign up, log out) go through `useSessionChange`, which clears Apollo's cache before navigating. Everything cached, down to `me: null`, belongs to the previous viewer; without the reset, signing in after being redirected to `/login` bounces straight back there.
- **Dialogs** go through Sacred's modal stack: `useModals().open(Component, props)`, with the component from `app/components/dialogs.tsx`, which loads each the first time it opens (and every one once the signed-in page is idle). Pages other than the desktop are lazy routes (`app.tsx`). A dialog or page imported directly lands in the first load, which CI holds to its budget (`scripts/bundle.mjs`). `useModalStack` is for what shows the stack; `useModals`' actions never change; `useOnTop` says whether a dialog is the topmost, which alone answers Escape.
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
- **The admin page is for `ADMIN_EMAILS` only.** `Query.admin` is null for anyone else, and `/admin` then shows the not-found page. Only `Admin.admit` (`domain/admin.ts`) mints an `Admin`, and everything an admin sees hangs off the `Admin` type, so never expose it anywhere else.
- **Push only to push services.** The server POSTs wherever a push endpoint points, so `PushSubscription.parse` (`domain/push.ts`) accepts only the browser vendors' push hosts. Never loosen it.
- **A browser notifies one user at a time.** Logging out removes it (`disablePush`, while still signed in), and every visit re-registers it for whoever is signed in.

## Deploying

The root `Dockerfile` builds both apps into one image that runs the API, which serves the app. The API listens at once (the app answers) and brings the database up to date before GraphQL and `/healthz` answer, running `prisma migrate deploy` only when a migration is pending or half-done (`infrastructure/prisma/migrations.ts`); a shutdown waits for it. `render.yaml` deploys it to Render's free plan, next to a Neon database; [docs/deploying.md](docs/deploying.md) walks through it. The Prisma CLI is therefore a runtime dependency of `@msgr/api`, not a dev one.

## Adding behaviour (TDD)

1. **Rule or value?** Write a failing test in `domain/*.test.ts`, then implement it as a pure function or `parse`. These tests are instant.
2. **Use case?** Write a failing test in `application/*.service.test.ts` with `createTestApp()` (in-memory adapters, fake hasher, ticking clock). Override any port to observe it: `createTestApp({ passwords: { ...fakePasswordHasher, verify } })`.
3. **New repository method?** Add it to the port in `application/ports.ts`, add its behaviour to `testing/repository-contract.ts`, and make both the in-memory and the Prisma adapter pass the contract. Run the Postgres contract before merging.
4. **New field?** Edit `graphql/schema.ts`, run `npm run codegen`, add a resolver, and cover it through `graphql/resolvers.test.ts`, which executes real operations against the schema.
5. **Something on screen?** Add a Playwright spec to `apps/e2e/tests` and run `npm run e2e`. Find things the way a person would, by role, label and text, with the helpers in `tests/support.ts` (`signIn`, `chooseMenu`, `chatWindow`, `anotherPerson` for a second browser). The seed data is there at the start of each run; the specs share one server, so make what you need rather than relying on another spec's leftovers. Every login counts toward the throttle (10 per email per 15 minutes, successful ones too), so spread sign-ins across the seeded accounts. If the change shows in the README's pictures, run `npm run screenshots`, look at the results and commit them; `apps/e2e/screenshots/readme.spec.ts` takes them with the clock fixed just after the seed's last messages.

Test through interfaces, not internals: assert on what a service, operation or repository returns. For new relations, assert query counts with `vi.spyOn(repositories.x, 'findByIds')`, as the chat-list test does.

## Gotchas

- `graphql/bounded-queries.ts` refuses a query more than 10 fields deep, or selecting more than 200 fields, 8 `bits` or one history (`messages`), or reading `messages` inside `messages` (`Message.chat` leads back to them), counting a fragment each time it's spread, over HTTP and the socket alike; a subscription reads at most `messages(limit: 1)`, and a socket holds at most 20. The app's largest operation selects 37 fields: a new one must fit. A defect's own message never reaches a client: `maskDefects`/`maskDefect` (`graphql/errors.ts`) log it and send "Something went wrong"; anything a client must read carries a code.
- The React Compiler (`vite.config.ts`) memoizes every component and hook, and `src/compiled.test.ts` fails if one stops compiling: it skips one it can't, silently (`try`/`finally`, `??=`, `||=` and a `throw` inside `try` are among what it can't yet), and one it doesn't take for a component, such as one returning a string or an array rather than elements (wrap them in `<>…</>`, as `PixelText` does). It assumes a module's `let` never changes inside a component or hook, and once read one after a call that reassigned it, so components and hooks never touch one: they call a plain function outside them that does (`use-install-prompt.ts`, `useClock`'s snapshot). Write no `useMemo`/`useCallback` of your own.
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
- A picked video plays from a `blob:` URL, which is why the CSP has `media-src 'self' blob:`. Frames are read while it plays (`requestVideoFrameCallback`), and any the browser skipped or never reported are sought one by one; phones seek slowly, so seeking every frame is the fallback, not the plan.
- The e2e's video, `apps/e2e/fixtures/square.webm`, is a black square sliding across white for 2 s, made with `ffmpeg -f lavfi -i color=c=white:s=320x180:r=24:d=2 -f lavfi -i color=c=black:s=80x80:r=24:d=2 -filter_complex "[0][1]overlay=x='t*120':y=50" -c:v libvpx-vp9 -b:v 0 -crf 40 -an square.webm`. ffmpeg's `drawbox` doesn't move with `t`. Recordings from `MediaRecorder` won't do: they don't know their duration.
- Push needs VAPID keys. Development uses its own pair (`config.ts`); production without `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` runs with push off. Push services refuse an `http:` VAPID subject, so pushes are signed with the app's address only when it's `https`, and with a `mailto:` otherwise.
- `public/sw.js` is plain JavaScript; the build writes only its `VERSION` and `SHELL` constants (`vite.config.ts`), and in development it keeps nothing, so test the shell against a production build (`npm run e2e`). It must show every push: iOS revokes the subscription of a site whose pushes show nothing. That's why the server skips the chat someone is watching (`Watching`, in process memory like the `PubSub`).
- The build also writes `.br` and `.gz` beside each text file, and the server sends those as they are: the free instance's sliver of CPU never compresses. Hashed `/assets` are kept a year; a missing one is a 404, not the app.
- Playwright's Chromium can't reach a push service, and headless it says `Notification.permission` is `"denied"` whatever it's granted. The e2e fakes the permission and covers the offer; real delivery works in Playwright's Firefox, through Mozilla's push service, with the prefs `dom.push.serverURL: 'wss://push.services.mozilla.com/'` and `permissions.default.desktop-notification: 1`. Phones are tested by hand (`docs/manual-testing.md`, section 7).
- The e2e config presets `notifications-dismissed` for every browser, so the notifications offer stays out of the way. To see the offer, make a context with `storageState: { cookies: [], origins: [] }`, as `notifications.spec.ts` does.
- The chat list's identicons come from chat ids, which change with every seed, so `npm run screenshots` always changes those avatars a little. Commit new pictures only when something else changed.
- A sound is squashed by `@msgr/media` too ([ADR 0008](docs/adr/0008-sounds-squashed-on-purpose.md); playing and recording, [ADR 0009](docs/adr/0009-one-audio.md)): `analyseSound` (browser only) makes whole-number codes, `encodeSound`/`decodeSound` code them with the movies' range coder (`range-coder.ts`), and `synthesizeSound` (browser only) plays them. The server checks a sound as it does a movie: decoded to exactly its length, coded again, taken only if identical, never silent. `lib/sound.ts`'s `evenOut` (cut rumble, compress, normalise) runs before `analyseSound`; change it or the codec's constants and every sound sounds different, and stored codes mean something else.
- iOS and sound, which the rules in `lib/audio.ts` exist for: after a sound has played as `playback`, iOS refuses the microphone to a page that hasn't said `play-and-record`; a microphone whose tracks aren't stopped stays taken, and every later Record fails until the app quits; and iOS leaves an `AudioContext` "interrupted" once the app has been away (locked, a call, opened from a notification), so `app/browser/audio.ts` lets the speaker go when the page hides and makes a new one when it finds one stuck. A Home Screen app asks for the microphone again after it's force quit; nothing on the page can change that. Chromium can't reproduce any of these, so they're pinned by `lib/audio.test.ts` and checked by hand (`docs/manual-testing.md`). Pickers ask for sound files by extension (`SOUND_FILES`): for `audio/*`, iOS offers the photo library and greys out MP3s in Files.
- The e2e's sound, `apps/e2e/fixtures/beep.wav`, is 2 s of 440 Hz, made with `ffmpeg -f lavfi -i "sine=frequency=440:duration=2" -ar 8000 -ac 1 -c:a pcm_s16le beep.wav`. Recording is tested with Chromium's pretend microphone (`--use-fake-device-for-media-stream`, set in `playwright.config.ts`), which beeps.
- `libs/media` (`@msgr/media`) holds what the API and the app share about 1-bit pictures and movies, and squashed sounds: the bit layout, Atkinson's dithering (`steadyAtkinson` for movies), the movie coder and strict base64. Keep it pure, with neither DOM nor Node types. Tests and Vite read its source through an alias; the API's unbundled build runs its compiled `dist`, so `nx` builds it first and the image copies it. A picture travels and is stored raw-DEFLATEd: the browser compresses with `CompressionStream`, and the server inflates under an exact cap (`zlib-picture-codec.ts`) and compresses again itself. A movie is coded by `encodeMovie` ([ADR 0007](docs/adr/0007-movies-coded-pixel-by-pixel.md)), pure code both ends run: the server decodes it to exactly its size and codes it again, taking only bytes identical to its own coding (any bytes decode to something, and a few can decode to a huge busy movie), about a third of a second of CPU for the largest, during which the single instance waits. Its JSON body is why `express.json` takes up to 1 MB. So that one request can't ask for many movies' worth of work, a mutation selects one field (`graphql/one-thing-per-mutation.ts`) and the socket takes only subscriptions (`onSubscribe` in `graphql/server.ts`).
- Emoji are dithered from each device's own font (`lib/emoji.ts`, drawn by `PixelText`), so they differ a little between a Mac and a phone. They are dithered at 32×32 (`SIZE`) and drawn 16 px tall. To replace one that comes out badly, add a 16×16 bitmap to `lib/emoji-art.ts`. Text that people write goes through `PixelText` wherever it's shown.
