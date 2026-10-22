# 11. The app's shell is kept on the device; chats are not

Date: 2026-10-22 · Status: accepted

## Context

Opened from a phone's Home Screen after 15 quiet minutes, Msgr showed Render's
loading page for about a minute while the free service woke ([ADR 5](0005-free-single-instance-hosting.md)):
the page itself came from the sleeping server. Then, if the server hadn't
answered `me`, the app sent a signed-in person to the login page, as it did for
any failed request: a tunnel or a bad signal signed people out too.

An uptime monitor now keeps the server awake, but deploys, a monitor's misses
and phones' networks still leave requests unanswered.

## Decision

- **The service worker keeps the shell.** `public/sw.js` keeps `index.html`,
  the hashed assets, the fonts and the icons, and answers every page load with
  this version's `index.html`, and assets from what it keeps. The build writes
  its `VERSION` (a hash of every file) and the `SHELL` list into `dist/sw.js`
  (`vite.config.ts`), so each build changes its bytes and browsers install it.
  `/graphql` and `/healthz` never go through it.
- **Chats are never kept on the device.** Everything a person wrote comes from
  the server, as before. Opening with no network shows the desktop and says
  so; nothing can be read or sent offline.
- **A new version takes over at once**, and pages already open keep working:
  the previous version's shell, with every asset an open page may still ask
  for, stays until the next one. The page then offers **Special → Restart to
  Update**. A Home Screen app looks for a new version whenever it comes back
  to the screen, at most every ten minutes.
- **Only `me: null` is signed out.** A request that never reached a server able
  to answer is asked again with backoff, queries only, never mutations
  (`lib/connection.ts`). Until the first answer the app shows the desktop, and
  after a moment why it's waiting (`Connecting`). Someone already in stays in
  while a refetch is retried.
- **The server answers at once.** It listens before the database is ready:
  the app and `/healthz` answer, GraphQL waits. It runs the Prisma CLI only
  when a migration is pending, which one query tells it in milliseconds.

## Consequences

- From the Home Screen the desktop appears at once, network or not; a waking
  server costs its minute, and no longer shows Render's page or signs anyone
  out.
- **The API changes in two steps.** A shell can be one version behind the
  server it talks to, so a field or argument the app uses is deprecated in one
  release and removed in a later one, never in the same.
- A deploy reaches an open app the next time it's opened from scratch, or by
  Restart to Update; until then it runs the version it loaded.
- Testing the shell needs a production build: the development server's
  `sw.js` keeps nothing. `apps/e2e/tests/shell.spec.ts` opens it offline and
  with the server refusing.
