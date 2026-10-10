# Push notifications

_Design, agreed 2026-10-10._

## Goal

Notifications that arrive on phones and desktops even with Msgr closed, and an easy way to get them: Msgr offers to turn them on (and, on an iPhone, shows how to install it first) once per device, never forcing it, so nobody has to dig through settings.

Today the page shows its own notifications with `new Notification(...)`. That only works while a tab is open, it throws on Android Chrome ("Illegal constructor"), and iOS hides `Notification` unless Msgr is on the Home Screen.

## Scope

In:

- Web Push for every browser that has it: desktop, Android, and iOS 16.4+ once installed.
- An installable app: a manifest, icons and a service worker.
- A once-per-device offer, the iOS install steps, and Chrome's install prompt wherever the browser offers it.
- Not notifying about the chat you're looking at, on any device.

Out:

- Notification settings per chat (muting).
- Offline use or caching in the service worker.
- Notifications in browsers that can't subscribe to push (Brave with Google push services off, say). They're told it couldn't be turned on.
- Expiring a subscription along with its session. Logging out removes it, and signing in moves it to whoever signed in (below).
- Noticing rotated VAPID keys. After a rotation, people turn notifications off and on again.

## How it works

1. A device with notifications on holds a Web Push subscription, and the server stores it against the user.
2. When a message is posted, the server pushes it to every participant except the sender, skipping anyone **watching** that chat: a visible Msgr page with that chat open.
3. The service worker shows every push it receives. Tapping the notification opens the chat.
4. The page shows no notifications of its own any more. It still beeps and counts unread messages in the tab title.
5. Chat-added notices go out the same way.

The server decides, not the service worker, because WebKit revokes a subscription after about three pushes that don't show a notification ([WebKit](https://webkit.org/?p=12945)). A service worker that quietly skipped the open chat would lose iPhones their notifications.

## The API

### Domain (`domain/push.ts`)

- `PushSubscription.parse({ endpoint, p256dh, auth })` returns `Result<PushSubscription, InvalidInput>`:
  - The endpoint must be an `https:` URL of at most 2,048 characters, on `fcm.googleapis.com`, `updates.push.services.mozilla.com`, `web.push.apple.com`, or a host ending in `.notify.windows.com`. The server POSTs to this URL, so the allowlist is the SSRF guard: no IP addresses, no other hosts.
  - `p256dh` is 87 base64url characters (65 bytes), and `auth` is 22 (16 bytes).
- `Notification = { title, body, chatId }`.
- `messageNotification(message, sender, chat)` builds it:
  - **Title:** the sender's name in a direct chat, "Bob in Weekend" in a group chat, "Bob in #general" in a channel.
  - **Body:** the text, or "Sent a drawing.", cut to 200 characters with "…". Messages go up to 4,000 characters, and push payloads stop at about 4 KB.
- `chatAddedNotification(event, by)` builds "Bob joined Msgr" / "They used your invite. Say hello!" and "Bob added you to #general" / "It's in your Chats now."

This text moves out of the frontend's `lib/alerts.ts`.

### Ports (`application/ports.ts`)

- **`repositories.pushSubscriptions`**
  - `save(userId, subscription)`: upserts by endpoint. A browser that changes hands moves to its new user.
  - `findByUserIds(ids)`: batch-shaped, and returns each subscription with its `userId`.
  - `remove(endpoint, userId)`: a no-op unless that user owns the endpoint.
- **`PushSender.send(subscription, notification): Promise<'sent' | 'gone'>`**: 'gone' is the push service answering 404 or 410. Other failures throw.
- **`Watching`**: `watch(userId, chatId)` returns a release function, and `isWatching(userId, chatId)` returns a boolean. It lives in process memory, like the throttle and the `PubSub`.
- **`Dependencies`** gains `pushSender: PushSender`, `pushKey: string | null` (the VAPID public key) and `watching: Watching`. Without keys, `pushSender` is a no-op and `pushKey` is null.

### Application

- **`createNotifier(deps)`**, with `message(message, chat)` and `chatAdded(event, recipient)`:
  - Recipients are the chat's participants, minus the sender, minus anyone `isWatching` that chat.
  - It sends to every recipient subscription in parallel, removes the ones that come back 'gone', and logs other failures.
  - The message service calls it after its publish, and so do the auth service (invite accepted) and the chat service (added to a channel). They don't await it, so pushes never slow down sending.
- **`push.enable(viewer, input)`** parses, then saves. **`push.disable(viewer, endpoint)`** removes.
- **`push.watch(viewer, chatId)`** returns an iterator that never yields. It watches from its first `next()` and releases on `return()`.

### GraphQL

```graphql
type Query {
  "The VAPID public key; null when push is off."
  pushKey: String
}
input PushSubscriptionInput {
  endpoint: String!
  p256dh: String!
  auth: String!
}
type Mutation {
  enablePush(subscription: PushSubscriptionInput!): Boolean!
  disablePush(endpoint: String!): Boolean!
}
type Subscription {
  "Held while a visible page shows this chat; never sends."
  watching(chatId: ID!): Boolean
}
```

The mutations and `watching` require a viewer.

### Infrastructure and config

- `infrastructure/push-sender.ts` wraps `web-push` (a new dependency) with a TTL of 24 hours and high urgency.
- `infrastructure/watching.ts` is the in-memory `Watching`.
- Prisma: a `PushSubscription` table with `endpoint` (unique), `p256dh`, `auth`, `userId` (cascade on delete) and `createdAt`.
- `Config.push` is `{ publicKey, privateKey, subject } | null`, read from `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`:
  - The subject is `CORS_ORIGIN`.
  - Development falls back to a fixed keypair, like `DEVELOPMENT_SECRET`.
  - Production without keys turns push off with a warning at boot instead of failing it.

## The frontend

### Installing and the service worker

- **`public/sw.js`**:
  - `push`: always `showNotification(title, { body, tag: chatId, renotify: true, icon, data: { chatId } })`.
  - `notificationclick`: focuses an open Msgr window and `postMessage`s the chat id, so the page routes there without reloading. With no window open, it calls `clients.openWindow('/' + chatId)`.
  - It's registered from `main.tsx`.
- **`public/manifest.webmanifest`**: name Msgr, `display: standalone`, `start_url: /`. The icons are the menu bar's `MARK`, scaled up pixel-perfect in black on white, as 192 and 512 px PNGs plus a 180 px `apple-touch-icon.png`. `index.html` links the manifest, the touch icon and `theme-color`.
- **`useInstallPrompt`** keeps Chrome's `beforeinstallprompt` event, exposes `install()` while it's available, and forgets the event on `appinstalled`. Chrome only fires the event after a click and about 30 seconds on the page, so the first offer usually has no Install button yet; the menu item does later.

### Turning notifications on

- **`lib/push.ts`** (pure, tested):
  - `notificationSetup(env)` returns:
    - `'push'` when the service worker and PushManager are both present;
    - `'install-first'` when `navigator.standalone === false` (only iOS has that property), meaning iOS in the browser;
    - `'unsupported'` otherwise.
  - `shouldOffer({ setup, pushKey, permission, subscribed, dismissed })` holds when the setup isn't `'unsupported'`, the server has a push key, this device has no subscription, permission isn't `denied`, and nobody has dismissed the offer on this device.
- **`useNotifications`** replaces the notify half of `useAlerts`:
  - `turnOn()` asks permission inside the tap, subscribes with `userVisibleOnly: true` and `pushKey`, then calls `enablePush`.
  - `turnOff()` unsubscribes, then calls `disablePush`.
  - The checkmark comes from `pushManager.getSubscription()`.
  - If subscribing fails, it opens a dialog saying notifications couldn't be turned on in this browser.
- **`useAlerts`** keeps the beep and the tab count. `AlertPreferences` becomes `{ sound }`, and an old stored `{ notify, sound }` still parses.

### Watching

`useWatching(chatId)` holds the `watching` subscription while the page is visible and a chat is open, and drops it on `visibilitychange`. Locking the phone stops counting as watching right away. A page that dies without saying so stops when its socket does.

### The offer, menus and dialogs

- **`NotificationsDialog`**, a Mac alert, opened by the chat page when `shouldOffer` holds:
  - **Push setup:** "Get a notification when a message arrives, even with Msgr closed?" with [Not Now] and [Turn On], plus [Install] while Chrome offers it.
  - **iOS in the browser:** "To get notifications, add Msgr to your Home Screen: tap Share, then 'Add to Home Screen', and open it from there." with [OK].
  - Not Now, OK and Escape store `notifications-dismissed` in localStorage, once per device. So does a Turn On that fails, so a browser that can't subscribe isn't asked again on every visit. A Turn On that succeeds stores nothing: after logging out and back in, the offer comes back, one tap from on again.
- **Special menu**:
  - "Notifications" as a checkbox where the setup is push.
  - "Notifications…" on iOS in the browser, which opens the install steps.
  - "Install Msgr…" while installable.
- **`NotificationsBlockedDialog`** also tells phones where to allow them. Android: ⋮ → Settings → Site settings. iPhone: Settings → Notifications → Msgr.

### Session changes

- Log out calls `disablePush` while still signed in, then unsubscribes.
- Every time the chat page opens with a subscription in the browser, it calls `enablePush` with it again. That re-registers the browser for whoever is signed in now. It also keeps a phone notifying after its 30-day session runs out and its owner signs in again.

A browser notifies one user at a time, and never the previous person after someone else signs in.

## Testing

- **Domain:**
  - The endpoint allowlist: http, unknown hosts, IP addresses and over-long URLs are refused.
  - Key lengths.
  - Titles and bodies, including drawings and the 200-character cut.
- **Services, via `createTestApp`** with an in-memory `PushSender` that records sends:
  - The sender is skipped, and so are people watching that chat. People watching another chat still get it.
  - 'gone' subscriptions are removed.
  - Chat-added sends one push.
  - `enable` moves an endpoint to its new user, and `disable` only removes your own.
  - Tests wait for the unawaited pushes with `vi.waitFor`.
- **Repository contract:** `pushSubscriptions` on both adapters, Postgres included.
- **`resolvers.test.ts`:** `pushKey`, both mutations requiring a viewer, and `watching` watching while open and releasing on completion.
- **Frontend:** `lib/push.ts` truth tables, and the `parseAlertPreferences` migration.
- **Playwright:**
  - The offer appears after the first sign-in, and Not Now is remembered.
  - The install steps appear when `navigator.standalone === false` is faked with an init script.
  - Existing specs and the README screenshots start with the offer dismissed: `playwright.config.ts` presets `notifications-dismissed` through `use.storageState`.
- **Manual:** Playwright's Chromium can't reach a real push service, so `docs/manual-testing.md` covers delivery on desktop Chrome, Android Chrome and an installed iPhone app, including that the chat you're looking at doesn't notify.

## Docs

- **ADR 0006, Web Push for notifications:** replaces 0005's "only while open" consequence, and records why the server decides (iOS revocation).
- **`CONTEXT.md`:** adds **Notification** and **Watching**.
- **`CLAUDE.md` and `SECURITY.md`:** push endpoints are allowlisted, and session changes drop the device's subscription.
- **`docs/deploying.md` and `render.yaml`:** `npx web-push generate-vapid-keys`, with both variables marked `sync: false`.
- **`docs/architecture.md`:** the push path.

## Order of work

1. **Installable app:** the service worker, manifest and icons, `useInstallPrompt`, the iOS install steps, and the Android crash fix (the page shows its notification through `registration.showNotification` for now). This stage stands alone.
2. **Web Push:** the domain, ports, adapters, migration, the notifier, GraphQL, `useNotifications`, `useWatching` and the offer's Turn On. Then the page's own notifications are deleted.
