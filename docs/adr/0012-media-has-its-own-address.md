# 12. Media has its own address

Date: 2026-10-22 · Status: accepted

## Context

A message's picture, movie or sound travelled inside the GraphQL JSON, as
base64, wherever the message did: in each page of a chat's history, fetched
again every time it opened and every time a phone's socket came back, in
every live event, and in the chat list's one-line previews, whose query
pulled each chat's last movie out of the database to send only its frame
count. A page of 50 could reach tens of megabytes; base64 adds a third; and
Render suspends a free service that sends too much. Avatars went the same
way, once per message in a history.

Each page query also ranked a chat's whole history to keep a few messages.

## Decision

- **A kept message holds its media's size, not its bytes.** `Message` reads
  carry a `PictureSize`, `MovieSize` or `SoundLength`; the bytes come from
  `MessageRepository.findMedia`, through the `media` loader, and only for
  whoever asks. The whole picture, movie or sound exists only while a message
  is sent (`MessageBody`, `NewMessage`).
- **Every picture, movie and sound has an address**, its `url` in the schema:
  `/media/:messageId/picture|movie|sound`, and `/avatars/:userId/:version`
  for an avatar, where the version names its contents (`pictureVersion`).
  The server sends the bytes as they are kept, to whoever may see them: the
  session cookie authenticates, and the same service authorizes, so a message
  you can't see answers 404, exactly like a missing one. A message never
  changes, and a changed avatar has a new address, so the answer is
  `Cache-Control: private, max-age=31536000, immutable`: the browser keeps
  it, and nobody between may. It keeps it for that session alone (`Vary:
Cookie`), so whoever signs in next on the device is asked for their own,
  and logging out clears what it kept (`Clear-Site-Data: "cache"`).
- **The address is opaque.** The server writes it; the app only follows it.
- `bits` stays, deprecated, for a release, as ADR 11 asks of any change an
  older shell may still use. It resolves through the same loader.
- **Pages read only what they return.** Each chat's page goes straight down
  its `(chatId, createdAt, id)` index (`LATERAL … LIMIT`), and pages take a
  cursor: `before` a message for earlier ones, `after` one to catch up. A
  cursor that isn't one of the chat's messages finds nothing, and
  `Query.messages` and `Chat.messages` answer it as not found, so a client
  starts again rather than take an empty page for no news. `offset` is
  deprecated. A `Page` is newest-with-an-offset or a cursor, never both.
- **A query asks for bounded work** (`graphql/bounded-queries.ts`): aliases
  could otherwise ask for the same movie's `bits`, or a page of history, a
  hundred times in one request. At most 10 fields deep, 200 fields, 8 `bits`
  and one history, never one inside another; a subscription, run again for
  every event, reads no more than `messages(limit: 1)`, and a socket holds at
  most 20.

## Consequences

- A history page is words and sizes: kilobytes, whatever it shows. Each
  picture, movie and sound is fetched once per browser, when it nears the
  screen, and kept.
- **Moving media later changes only the server.** A CDN can't cache private,
  cookie-checked answers. To use one, `url` becomes a signed, expiring
  address served publicly (anyone holding the link sees it until it
  expires), or points at object storage (Neon's free plan holds 0.5 GB, and
  media is most of what fills it). The app needs nothing new either way.
- Fetching media is `connect-src 'self'`, which the CSP already allows.
- An avatar is anyone's to see by its address, as `users` already shows
  everyone to anyone signed in.
