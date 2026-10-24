# Architecture

Msgr is one container: a Node GraphQL API that also serves the React app, in
front of one Postgres database. Everything here is sized for a few dozen
friends on free hosting, and stays simple on purpose.

```
 browser ── https://msgr.example ─────────────────────────────────────────┐
   │  GET /, /assets/*, /invite/…   → the built app (STATIC_DIR)          │
   │  POST /graphql                 → queries and mutations               │  one Node process
   │  WS   /graphql                 → the live feed (graphql-ws)          │  (apps/api)
   │                                                                      │
   │  session: httpOnly cookie "token" on all three                       │
   └──────────────────────────────────────────────────────────────────────┘
                                   │ Prisma
                                   ▼
                               Postgres
```

## Opening the app

The service worker (`public/sw.js`) keeps the built app on the device, so it
opens at once from the Home Screen, with or without a network, and never shows
the host's "waking up" page. It keeps nothing anyone wrote: chats and messages
come from the server. Until the server says who's signed in, the app shows the
desktop and, after a moment, why it's waiting; only the server saying nobody is
signed in sends anyone to `/login`. Queries that couldn't reach a server are
asked again by themselves. The server, for its part, listens the moment it
starts and holds GraphQL until the database is up to date
([ADR 11](adr/0011-the-shell-is-kept-chats-are-not.md)).

## The API

A functional core and an imperative shell; [CLAUDE.md](../CLAUDE.md) has the
layers, the request flow and the conventions. In short: `domain/` holds pure
types and rules, `application/` the use cases behind ports, `infrastructure/`
the adapters (Prisma, bcrypt, JWT, PubSub, the throttle), and `graphql/` the
transport. `main.ts` is the only file that picks adapters.

## How a message travels

1. The composer calls `sendMessage` with text, a picture, a movie or a sound,
   or text with one of them. `MessageService` parses each (a picture is
   inflated, a movie or a sound decoded, each checked against its size; see
   [ADR 0007](adr/0007-movies-coded-pixel-by-pixel.md) and
   [ADR 0008](adr/0008-sounds-squashed-on-purpose.md)), checks the viewer is a
   participant, stores the message and marks the chat active, in one
   repository call. From then on the message carries its media's size; the
   bytes have an address of their own, fetched once by each browser that
   shows them and kept ([ADR 0012](adr/0012-media-has-its-own-address.md)).
2. It publishes the message to every participant through the in-process
   `PubSub`.
3. Each participant's open tab has one `messageReceived` subscription, owned by
   `SignedIn`, the layout of every signed-in page (`useChatFeed`). It moves the
   chat to the top of the list, appends the message to that chat's cached
   history, and hands it to
   `useAlerts`, which beeps (and counts it in the tab) if it's someone else's
   message in a chat you aren't looking at.
4. Meanwhile, without making the sender wait, the `Notifier` pushes it to the
   browsers of every other participant who isn't watching that chat (a visible
   page holds a `watching` subscription for the chat it shows). The service
   worker (`public/sw.js`) shows it, open or not, and a click opens the chat.
   See [ADR 0006](adr/0006-web-push-for-notifications.md).

The page's second subscription, `chatAdded`, tells the viewer about chats that
now include them without them opening one: the direct chat a newcomer started by
signing up with their invite, or a channel someone added them to. The chat goes
to the top of the list, and `useAlerts` rings for it.

A third, `typing`, carries "Ana is typing…": the composer calls the `typing`
mutation every few seconds while there's text, and the server passes it to the
chat's other participants through another in-process `PubSub`, storing nothing.

Reads are stored. While a chat is open on a visible page, the page calls
`markRead` with its newest message; the server keeps one `ReadMark` per
advance, and a message was first read at the earliest mark on it or after it
in its chat (never counting its sender). Get Info on a message reads them
through `Message.readBy`.

Because `PubSub` and the login throttle live in process memory, Msgr runs as a
single instance (see [ADR 0005](adr/0005-free-single-instance-hosting.md)).

## The frontend

Vite and React, with Sacred Computer's components vendored into
`apps/frontend/src/sacred` and restyled as a 1984 Macintosh by `src/skin.css`
([ADR 0001](adr/0001-vendor-sacred-computer-and-skin-it.md)). Every signed-in
page sits under `SignedIn` (`app/components/SignedIn.tsx`), which holds what
lasts while someone is signed in, whatever's on screen: the live feed, alerts,
typing and notifications. A page only draws itself: the chat page is the
desktop, a menu bar, the Chats window and the open chat's window; the admin
page shows storage.
It's layered like the API, with imports flowing one way, enforced by lint
([ADR 0010](adr/0010-frontend-layers.md)): pages → components → hooks →
data, browser → lib. `lib/` holds the pure logic, each with tests;
`app/browser/` is the only code touching the browser's devices, decoders
and storage; `app/data/` holds the GraphQL several parts share and the
cache writes; `app/hooks/` holds the live feed, alerts and the clock.

## Accounts and security

Sign-up is invite-only ([ADR 0003](adr/0003-invite-only-accounts.md)). The
session is an httpOnly cookie and the app shares the API's origin
([ADR 0002](adr/0002-one-origin-one-session-cookie.md)).
[SECURITY.md](../SECURITY.md) describes what is protected and what isn't.

## Chats

A chat is direct (two people), a group (a title, a fixed set of people) or a
channel (`#name`, anyone may join) ([ADR 0004](adr/0004-channels-are-chats.md)).
Only participants can read a chat; to everyone else it doesn't exist. The
vocabulary is in [CONTEXT.md](../CONTEXT.md).

## Decisions

The [ADRs](adr/) record why things are the way they are.
