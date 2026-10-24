# The excellence run

_Roadmap, proposed 2026-10-22; decisions below._

## Goal

Make Msgr the example this stack is measured against: it opens at once from the Home Screen, feels like a phone app on a phone and like a 1984 Macintosh everywhere, costs nothing to run, and has code whose shape explains itself.

## Agreed

- **Hosting stays $0.** Render's free web service and Neon's free Postgres, one instance. The server will still sleep; the app must make that invisible where it can and graceful where it can't.
- **An instant shell, no chat data on the device.** The service worker caches the app itself, so it draws at once with no network. Chats and messages come from the server, as now.
- **The Mac look, a phone's feel.** Black and white, Chicago, stripes, dither, inversion. On a phone, the desktop-and-windows ideas that fight a thumb give way: full-screen chats, a back gesture, a composer on the keyboard, safe areas.
- **Plan first, then focused PRs**, each green on typecheck, lint, unit, Postgres contract and e2e.

Assumed, unless you say otherwise:

- The stack stays: React 19, Apollo Client 4, Apollo Server 5, graphql-ws, Prisma, Postgres, Vite, Nx. Anything beneath that may change.
- Every feature stays.
- Production data survives every migration. API changes are additive for one release, since an old cached shell may talk to a new server (below).

## Where it stands

What's already excellent, and stays: the layers on both sides and the lint that enforces them; ports, `Result`s and branded values; the repository contract against both adapters; the pure, tested `lib/` (2,005 lines with 2,161 of tests); `recordMessage`/`recordChat` as the only cache writes; `lib/audio.ts`'s state machine; media intake that decodes, re-codes and compares; the link previewer's guards; the ADRs.

What a person feels, measured on the production build (iPhone 15 viewport, local Postgres) and in the code:

| Problem                                                                                                | Evidence                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Opening from the Home Screen after 15 idle minutes shows Render's loading page for about a minute.** | `public/sw.js` caches nothing, so the page itself needs the sleeping server.                                                                                                                                                                                                                                                                                                                         |
| **…and a server that's asleep or unreachable signs you out.**                                          | `SignedIn` treats any error on `me` as signed out and goes to `/login` (`SignedIn.tsx:38`).                                                                                                                                                                                                                                                                                                          |
| **The server opens its port late.**                                                                    | Every boot runs `npx prisma migrate deploy` first: 2.2 s on 4 cores with nothing to apply (Render's free plan has about a tenth of a CPU), against 0.7 s to boot the API itself.                                                                                                                                                                                                                     |
| **One 546 kB script, sent uncompressed.**                                                              | 165 kB gzipped, if the edge compresses it (to check on production). 40 kB of it is codegen's map of every operation, kept as both source text and AST, which also can't be split.                                                                                                                                                                                                                    |
| **Every live event re-renders the whole desktop**: each typing notice, message, profile change.        | Subscriptions without `ignoreResults` re-render `Live`, whose context value is a fresh object each time (`SignedIn.tsx:110`); nothing in `app/` is memoized. Every bubble's `PixelText` and link card redraws.                                                                                                                                                                                       |
| **Opening a chat downloads its media again, every time, as base64 in JSON.**                           | `GET_CHAT_MESSAGES` inlines picture, movie and sound bytes and each sender's avatar, with `cache-and-network` and a refetch on every reconnect. A page of 50 can reach tens of MB. Render suspends a free service that uses too much bandwidth.                                                                                                                                                      |
| **Each page query ranks a chat's whole history.**                                                      | `findPages` runs `ROW_NUMBER()` over every message of each chat and selects every media column (`message.repository.ts:41`). The chat list's one-line previews pay that for every chat.                                                                                                                                                                                                              |
| **Movies and drawings repaint with one `fillRect` per run of ink.**                                    | A dithered 320×180 frame is about 14,300 runs, 8 times a second per movie on screen.                                                                                                                                                                                                                                                                                                                 |
| **The composer fakes its caret.**                                                                      | Sacred's `TextArea` hides a transparent native control under a mirrored div: three layouts per keystroke, and iOS's selection handles, autocorrect and marked text can't show properly.                                                                                                                                                                                                              |
| **On a phone it's a narrow desktop.**                                                                  | The window frame and the dither around it take the edges. The menu bar repeats the phone's clock. The composer takes two rows. Every message carries a full date. The chat list has no unread markers. The only way back is the close box, since an installed app has no back swipe. New messages scroll you down even when you'd scrolled up to read, and there's no way to see past the latest 50. |
| **Sending waits for the server.**                                                                      | No optimistic response; a second message can't be sent while the first is in flight.                                                                                                                                                                                                                                                                                                                 |
| **A bug's message reaches the client.**                                                                | No `formatError`: "Can't reach database server at …" goes out as is, and nothing is logged.                                                                                                                                                                                                                                                                                                          |
| **One query can exhaust the instance's memory.**                                                       | `Message.chat` leads back to `Chat.messages`, with no depth rule.                                                                                                                                                                                                                                                                                                                                    |

## Principles

Every PR below follows from these, and each gets a test or a budget in CI so it stays true.

1. **The shell never waits for the server.** Everything needed to draw Msgr is on the device. Only people's words, pictures, movies and sounds come over the wire.
2. **Bytes travel once.** Media gets its own address, cached by the browser like any image. GraphQL carries words and sizes.
3. **Render what changed, and only that.** Live events write the cache. Each component reads the slice it draws, through a fragment of its own.
4. **A phone is not a narrow desktop.** Same Macintosh, laid out for a thumb.
5. **Own the primitives.** Native controls, styled by the skin. A vendored layer stays only where it earns its place.
6. **Budgets are tests.** Script size, query counts, cache headers and payload shapes are asserted, not hoped for.

## The roadmap

Seven PRs, in this order. Data before UX because the phone's history (anchored scrolling, earlier messages) needs cursor pages and light payloads. Render and toolchain before UX so the new screens are built on the new patterns.

| #   | PR                                | You'll feel                                                   | Size |
| --- | --------------------------------- | ------------------------------------------------------------- | ---- |
| 1   | Instant shell, graceful wake      | Opens at once; never signed out by a sleeping server          | M    |
| 2   | Bytes travel once                 | Chats open fast, even with movies; history goes back past 50  | L    |
| 3   | Render only what changed          | Typing and messages stop shaking the page; smaller first load | M    |
| 4   | Own the controls                  | A real caret, autocorrect and selection; dialogs that behave  | L    |
| 5   | A phone's layout                  | Full-screen chats, back swipe, composer on the keyboard       | L    |
| 6   | A messenger's manners             | Unread counts and badges, days and runs, instant sends        | M    |
| 7   | Lean server, tidy code, true docs | Faster wakes; the codebase reads as one                       | M    |

### 1. Instant shell, graceful wake

**The app.**

- `sw.js` stays hand-written plain JavaScript. A small Vite plugin writes the build's file list into it, so every build changes its bytes and the browser installs the new one:
  - The files are `index.html`, the hashed assets, the fonts and the icons.
  - Page loads are answered from the cache at once (app shell), and assets cache-first.
  - `/graphql` and `/media` never go through it.
  - The old caches go when a new version activates.
- **Updates.** A new version installs in the background and takes over the next time the app opens cold, or at once from **Special → Restart to Update**, which appears only when an update is waiting. To keep an old shell working against a new server, API changes stay additive for one release: deprecate, then remove.
- **Signed out means `me: null`, and nothing else.**
  - A network error, a timeout or a non-JSON answer shows a "Waking up Msgr…" window with the wristwatch, retrying with backoff.
  - A second "No connection" state follows `navigator.onLine`.
  - Neither ever goes to `/login`.
- **One round trip, not two.** `main.tsx` starts `me`, `chats` and the routed chat's history together, instead of the chat queries waiting for `me`.
- **Fonts become hashed `.woff2`.** About 30% smaller, immutable, and precached.
- **Home Screen basics:**
  - `viewport-fit=cover` with safe-area insets, and `apple-mobile-web-app-status-bar-style`.
  - A `theme-color` that follows the theme (light, dark, tint).
  - `overscroll-behavior: none`, `touch-action: manipulation`, and no tap highlight on the chrome.

**The server.**

- **Open the port first.**
  - The static app and `/healthz` answer at once. `/graphql` and socket upgrades wait on a `ready` promise.
  - `/healthz` answers 204 from memory and never wakes Neon. `render.yaml` points the health check at it.
  - The bcrypt decoy hash is computed lazily.
- **Skip the Prisma CLI when nothing is pending.**
  - At boot, one `SELECT` of `_prisma_migrations` through the app's own client is compared with the migrations folder. The CLI runs only when a migration is missing. Same safety; on almost every wake the CLI never starts.
  - Node runs as PID 1 (`exec`), so `SIGTERM` reaches it.
  - Boot logs timestamps for: started, migrated, listening, database connected. The first production wake then tells us how much of the minute is ours.
- **Static details:**
  - A missing `/assets/*` is a 404, not `index.html`.
  - `X-Powered-By` goes; HSTS, `Permissions-Policy` and `Cross-Origin-Opener-Policy` come.
  - Brotli and gzip are precompressed at build and served as files, so the tiny CPU never compresses. This is skipped if Render's edge already compresses (checked first with `curl` on production).

**Tests.**

- e2e:
  - Load once, go offline, reload: the shell draws and says so, and you stay signed in.
  - `/graphql` aborted: "Waking up", never `/login`.
- `server.test.ts`: cache headers per path, the assets 404, `/healthz`.
- A unit test for the pending-migrations check.

**ADR 0011:** the app shell is cached and chat data isn't; how versions roll; the additive-API rule.

### 2. Bytes travel once

**Pages that touch only what they return.**

- `findPages` becomes `unnest(chatIds) CROSS JOIN LATERAL (… ORDER BY "createdAt" DESC, id DESC LIMIT n)` on the existing `(chatId, createdAt, id)` index, with a `before:` cursor instead of `offset`.
- Message rows carry sizes, not bytes.
- Contract tests cover the cursor, and a `vi.spyOn` count covers the chat list.

**Media at its own address, on the same origin:**

- `GET /media/:messageId/picture|movie|sound` and `GET /avatars/:userId/:hash` serve raw bytes:
  - authenticated by the session cookie;
  - authorized through the same service (`visibleTo`: a chat you're not in answers 404, exactly like a missing message);
  - with `Cache-Control: private, max-age=31536000, immutable`, which is safe because a message never changes and an avatar's address carries its hash.
- base64's third is gone.
- The CSP needs nothing new; it's all `'self'`.
- `bits` stays one release, deprecated, for old shells.
- Logging out answers with `Clear-Site-Data: "cache"`, so a shared device forgets the pictures.

**Light live events.**

- The feed carries a message's words and media addresses, not its bytes or the chat's participants.
- The publisher's filled loaders are shared by every recipient, instead of each one loading the same chat and sender again.
- Query counts are asserted.

**Catching up, not starting over.**

- Reopening a chat or reconnecting fetches `messages(after: newestId)` and merges it into the cached page.
- **Load earlier** pages back with `before:`.

**Fragments where they're drawn.**

- `Face`, `MessageBody` and `ChatRow` each declare the fields they draw. List rows read theirs with `useFragment`, so a row re-renders only when its own data changes.
- This ends the 14 copies of `avatar { width height bits }`.
- `participants` leaves queries that never read it.
- Three `refetchQueries: [GET_CHATS]` become cache writes.
- Get Info stops polling avatars.

**Safety.**

- A `formatError` that logs the original and sends "Something went wrong" for anything that isn't a `DomainError`.
- A validation rule beside `oneThingPerMutation`: a depth cap, and no `messages` under `messages`.
- Both tested through `resolvers.test.ts`.

**ADR 0012:** media has its own addresses.

### 3. Render only what changed

- **Toolchain.**
  - Add `@vitejs/plugin-react` with the **React Compiler**: Fast Refresh in development, and memoization without hand-written `memo`.
  - Vendored code can opt out.
  - The hooks lint rule gains the compiler's checks.
- **Events don't re-render their hosts.**
  - `ignoreResults` on all five subscriptions; the cache writes still happen.
  - `SignedIn`'s context splits into what never changes while signed in (viewer, actions) and the stores components subscribe to (typists, alerts) through `useSyncExternalStore`.
  - The modal context splits into stable actions and the stack.
- **Time is a leaf.** An `<Ago date>` component is the only thing that reads `useClock`, instead of every bubble re-running its emoji and link splitting each minute.
- **Pixels the cheap way.**
  - Each bitmap frame becomes one `ImageData` per theme, painted with `putImageData`.
  - Movies step imperatively on the tick, without React state.
  - Paint coalesces pointer moves per frame and redraws dirty rows only.
  - Faces' data URIs are memoized by bits and inks.
  - Decoded media is read from the cache synchronously, so nothing flashes on mount.
- **Smaller first load.**
  - Codegen's client-preset Babel plugin (Babel is there anyway for the compiler) turns each `gql()` into a direct import, so operations split with their screens.
  - Login, sign-up and admin are lazy routes. Paint, Sound, Trim, Get Info, Profile and the media encoders are lazy dialogs, prefetched when idle and precached by the shell anyway.
- **Budgets in CI.**
  - A script reads Vite's manifest and fails when the first load's JavaScript passes its budget. The target is about 120 kB gzipped, down from 165; I'll set it from the measured result.
  - A Playwright check counts renders of `MessageBubble` across a typing notice: it must be zero.

### 4. Own the controls

Sacred Computer was the right start ([ADR 0001](../../adr/0001-vendor-sacred-computer-and-skin-it.md)). Today it's mostly a style layer the skin overrides:

- 78 `srcl-` overrides, 32 of them for its two text fields.
- 13 of its 23 components are used by exactly one app file; 7 are wrappers of 20 lines or fewer.
- The fields fight the phone.

The proposal:

- **Fields on native controls.** `Field` and `Composer` are real `<input>` and `<textarea>` elements, with `caret-color: var(--ink)` and a block-ish caret where the platform allows. Auto-grow is measured once per frame. Typed emoji show through `PixelText`, as everywhere else.
- **Dialogs on `<dialog>`.**
  - `showModal()` gives focus trapping, an inert background, Escape and the top layer for free, replacing 11 hand-written Escape handlers.
  - `useModals().open(Component, props)` keeps its shape, on an owned provider.
  - On a phone, dialogs rise from the bottom as sheets in the same Mac frame.
- **Menus on the Popover API.** Light dismiss and the top layer, positioned with CSS anchor positioning where available. This replaces the `MutationObserver` that watches the whole body while a menu is open.
- **The rest.** Single-use wrappers fold into the component that uses them. The tint math moves into the skin's tokens, and `sacred/` goes.

**An ADR:** own the Macintosh's controls (supersedes 0001). Not written: Sacred stays (answer 6).

### 5. A phone's layout

Below 760 px (as now), the screen is the window:

```
┌──────────────────────────────────────┐
│ (o)  File   View   Special           │ menu bar, under the status bar; no clock
├──────────────────────────────────────┤
│ <  ═══════════ #general ═════════ (i)│ the title bar is the navigation bar
│ 5 members · Ana is typing…           │
│                                      │
│                Today                 │ days, not a date on every message
│ [::] Charlie Brown                   │ face and name once per run
│      ┌───────────────────────┐       │
│      │ Who is up for lunch?  │ 9:41  │
│      └───────────────────────┘       │
│      ┌──────────────┐                │
│      │ Noon-ish.    │                │
│      └──────────────┘                │
│                 ┌──────────────────┐ │
│                 │ Count me in.     │ │ your own, inverted
│                 └──────────────────┘ │
├──────────────────────────────────────┤
│ [+] [ Write a message          ] [>] │ one row on the keyboard; grows to 5 lines
└──────────────────────────────────────┘
```

- **Edge to edge.**
  - On a phone the window fills the screen, keeping its 1-pixel frame, stripes and title.
  - The dither shows only between windows, as they open and close.
- **The title bar navigates.**
  - The close box becomes `<` with a 44-point target.
  - Info opens the chat's people and Add People, which move out of the crowded status line.
  - The Chats window's title bar holds **New…**.
- **Back is a swipe.**
  - Dragging from the left edge moves the window's dotted outline with your finger, as dragging a window did in 1984.
  - Let go past a third and it closes with the Mac's zoom rectangles. Opening a chat zooms out of its row the same way.
  - Under reduced motion both are instant.
- **The composer sits on the keyboard.**
  - `visualViewport` sets `--keyboard-inset`, so the composer stays on the keyboard and the list stays anchored on iOS.
  - Android Chrome gets `interactive-widget=resizes-content`.
  - Attach is a `[+]` beside the field, Send a `[>]`, enabled only when there's something to send.
- **Thumb-sized chrome.** On a coarse pointer, menu items and buttons are at least 44 points tall.
- **Get Info by holding.**
  - On touch, a long press opens Get Info, inverting the bubble while held, so scrolling past a message never opens a dialog.
  - A click still opens it with a mouse.
- **Desktop keeps its desktop**, and gains everything in PR 6.

**An ADR:** phones get a phone's layout, written instead as [ADR 0013](../../adr/0013-phones-keep-the-desktops-look.md) (answer 7). The e2e suite gains a phone project (Pixel 7 and iPhone viewports) for these specs, and `npm run screenshots` gains phone pictures.

### 6. A messenger's manners

- **Unread.**
  - `Chat.unreadCount` counts others' messages after the viewer's latest `ReadMark`; no new table.
  - The list shows unread chats with bold titles and an inverted count, and the feed keeps it current through `recordMessage`.
  - The Home Screen icon shows the total (`navigator.setAppBadge`). The service worker sets it on each push from a total in the payload, and reading clears it.
- **Days and runs.** A pure `lib/runs.ts` (with a test) groups messages into days ("Today", "Yesterday", "Tue 14 Oct") and runs (the same sender within 5 minutes). A run shows its face and name once and its time once.
- **Instant sends.**
  - Text, pictures, movies and sounds appear the moment you press Send, from what's on the device, with the wristwatch until the server has them.
  - The field clears at once and a second message can follow.
  - A failure says "Not sent", with Retry, and keeps the content.
- **Scrolling that respects you.**
  - New messages scroll the list only when you're at the bottom or just sent one. Otherwise a "New messages" button appears.
  - A `ResizeObserver` keeps the list pinned while link cards and media arrive.
  - **Load earlier** keeps your place.
  - `content-visibility: auto` keeps long histories cheap, before anything like virtualization.
- **Connection you can see.** A socket down for more than 2 seconds shows "Reconnecting…" in the title bar's status, where typing already shows.

### 7. Lean server, tidy code, true docs

- **A smaller image.**
  - The runtime installs the API's dependencies only. React, Apollo Client and the router move to the frontend's, and the Prisma CLI stops being a boot dependency.
  - Image size and wake time are measured before and after.
- **One way to do each thing.**
  - The four PubSub adapters become one `pubSubTopic<T>`, and the three base64 size checks and two `sameBytes` become one each.
  - `addToChannel` adds everyone in one transaction.
  - `Query.channels` authorizes in its service, and `Page` is parsed at the service boundary.
  - Service-worker and push code moves into `app/browser/`, per ADR 0010.
- **Small robustness.**
  - A push timeout.
  - The throttle sweeps at most once per window.
  - A `connection_limit` on the pool.
- **Docs that match the code.** CLAUDE.md, `docs/architecture.md`, CONTEXT.md and the README are rewritten where the run changed them, and new screenshots are taken.

## Decided

Answered 2026-10-22:

1. **The server is kept awake** by an uptime monitor the owner runs. Once PR 1 lands, it points at `/healthz`. PR 1 still matters: the shell opens with no network at all, and deploys, tunnels and poor mobile signal still fail requests.
2. **The browser's HTTP cache may keep media** (`private, immutable`), cleared on logout. Media URLs are opaque, written by the server and only followed by the app, so moving media to a CDN or object storage later changes the server alone. A shared CDN needs signed, expiring URLs in place of the cookie; ADR 0012 records that path.
3. **Get Info on touch is a long press.**
4. **Sacred: open.** Replacing it is recommended (the fields, dialogs and menus go anyway; what's left doesn't justify a second style system). Trimming it is the alternative. Decided before PR 4.
5. **Each PR has its own `claude/…` branch**, so the next can be in review while the previous one is.

Answered 2026-10-24:

6. **Sacred stays**, its fields made fast and correct in place (PR 4) rather than replaced.
7. **Phones keep the desktop's look** ([ADR 0013](../../adr/0013-phones-keep-the-desktops-look.md)), after seeing each part of the phone layout built: only Back and Info in a chat's title bar and New… in the Chats window's, the composer kept on the keyboard, and Get Info by holding. Edge to edge, the clock's removal, the back swipe, the zoom rectangles, the thumb-sized controls and the one-row composer are not taken.

## Out of scope

- Reading or sending offline, and keeping chats on the device.
- More than one instance, and changing hosts.
- Virtualizing the history (unless `content-visibility` proves too little).
- New features beyond unread counts, app badges and loading earlier messages.
