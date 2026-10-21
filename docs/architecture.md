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

## The API

A functional core and an imperative shell; [CLAUDE.md](../CLAUDE.md) has the
layers, the request flow and the conventions. In short: `domain/` holds pure
types and rules, `application/` the use cases behind ports, `infrastructure/`
the adapters (Prisma, bcrypt, JWT, PubSub, the throttle), and `graphql/` the
transport. `main.ts` is the only file that picks adapters.

## How a message travels

1. The composer calls `sendMessage` with text, a picture or a movie, or text
   with one of them. `MessageService` parses each (a picture is inflated and a
   movie decoded, each checked against its size; see
   [ADR 0007](adr/0007-movies-coded-pixel-by-pixel.md)), checks the viewer is a
   participant, stores the message and marks the chat active, in one
   repository call.
2. It publishes the message to every participant through the in-process
   `PubSub`.
3. Each participant's open tab has one `messageReceived` subscription, owned by
   the chat page (`useChatFeed`). It moves the chat to the top of the list,
   appends the message to that chat's cached history, and hands it to
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
([ADR 0001](adr/0001-vendor-sacred-computer-and-skin-it.md)). The chat page is
the desktop: a menu bar, the Chats window and the open chat's window.
`lib/` holds the pure logic, each with tests; `app/hooks/` holds the live feed,
alerts and the clock.

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
