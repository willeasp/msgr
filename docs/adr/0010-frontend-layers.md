# 10. Frontend layers

Date: 2026-10-21 · Status: accepted

## Context

The API has had a shape from the start: domain, application, infrastructure
and graphql, each importing only the layers inside it, enforced by ESLint.
The app had folders (pages, components, hooks, lib) but no rule, and as
features landed, code went wherever it was first needed:

- The picture, video and sound file readers sat in `components/chat/`,
  though none is a component. `TrimDialog` and `PixelText` decoded media
  inline. `lib/theme.ts`, meant to be pure, wrote `localStorage` and
  `<body>`, and two hooks kept their own `localStorage` keys, unguarded
  against a browser that refuses storage.
- Hooks imported GraphQL operations from components (`useChatFeed` took
  `GET_CHATS` from `ChatSidebar`), and dialogs from other windows, so a
  component couldn't change its query without breaking its neighbours.
- A hook lived in `components/chat/`, a type in `components/chat/`, a
  component and a hook in a topic folder, `auth/`, and a function in
  `lib/utils/`.
- Audio got its own folder in ADR 0009, `app/devices/`, but only audio: the
  browser's other APIs still had nowhere to go.
- The shared library, `@msgr/bitmap`, came to hold the sound coder too.
- On the API side, the rule let `graphql/` import adapters from
  `infrastructure/` and `testing/`, though only `main.ts` should pick them.

Each was small; together they meant the next change had no obvious place,
and would make one up.

## Decision

The app is layered like the API, each folder holding one kind of thing,
and importing only what's below it:

```
pages → components → hooks → data, browser → lib
```

- `lib/` is the functional core: pure decisions, each with a test. No
  React, no `document`, `window` or `navigator`; what it needs from the
  page comes in as arguments. Rules that drive the browser are written
  here against a port, as `lib/audio.ts` is.
- `app/browser/` is the imperative shell: the only code touching the
  browser's devices, decoders and storage (Web Audio, `MediaRecorder`,
  `createImageBitmap`, off-screen canvases and videos, `localStorage`).
  It replaces `app/devices/`, which was too narrow a name for decoding a
  file or keeping a setting. `storage.ts` owns every key Msgr keeps.
- `app/data/` holds what Apollo's guidance says shouldn't live in a
  component: operations several modules read (the chat list, a chat's
  header and history, the viewer) and the cache writes that keep them
  together (`recordMessage`, `recordChat`). An operation one component
  uses stays beside it, colocated.
- `app/hooks/` holds React state and effects, `app/components/` what's
  drawn, `app/pages/` the routes. Folders are named for a kind of code,
  never a topic: no `auth/`, no `utils/`.
- `apps/frontend/eslint.config.mjs` enforces the direction with
  `no-restricted-imports` per folder, and the browser's APIs with
  `no-restricted-globals`, `-properties` and `-syntax` outside
  `app/browser/`. The messages name the place to go instead.
- The shared library is `@msgr/media`, for what it holds. The API's rule
  now keeps `graphql/` from `infrastructure/` and `testing/`.

These are established patterns, not new ones: ports and adapters with a
functional core and imperative shell, as the API already uses; one-way
imports between layers, enforced by lint, as Bulletproof React and
Feature-Sliced Design both recommend; and Apollo's own advice to colocate
a component's data needs and keep shared operations apart.

## Consequences

- A change that reaches for the browser from a component, for storage from
  a hook, or for a component from a hook fails lint, with a message
  naming where it belongs. The table in CLAUDE.md says where new code goes.
- `app/browser/` has no unit tests of its own: it's kept thin, and what's
  worth testing is pushed into `lib/`. The e2e covers it in a real browser.
- Shared operations are still whole queries, not fragments. Composing
  each component's fragment into one query per page, as Apollo
  recommends, would remove the remaining duplication between the chat
  list's query and the feed's subscriptions; it's a larger change, left
  for when that duplication costs something.
- If a new kind of code fits no folder, that's a decision for an ADR, not
  a file at the top of `app/`.
