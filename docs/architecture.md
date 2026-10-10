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

1. The composer calls `sendMessage` (the paint window, `sendDrawing`).
   `MessageService` parses the text or the drawing, checks the viewer is a
   participant, stores the message and marks the chat active, in one
   repository call.
2. It publishes the message to every participant through the in-process
   `PubSub`.
3. Each participant's open tab has one `messageReceived` subscription, owned by
   the chat page (`useChatFeed`). It moves the chat to the top of the list,
   appends the message to that chat's cached history, and hands it to
   `useAlerts`, which beeps and shows a desktop notification if it's someone
   else's message in a chat you aren't looking at.

The page's second subscription, `chatAdded`, tells the viewer about chats that
now include them without them opening one: the direct chat a newcomer started by
signing up with their invite, or a channel someone added them to. The chat goes
to the top of the list, and `useAlerts` rings for it.

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
