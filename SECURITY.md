# Security

Msgr is a small chat for people who know each other. This page says what it
protects, how, and where its limits are. The decisions behind it are in
[docs/adr](docs/adr/).

## Reporting a problem

Please don't open a public issue. Contact the maintainer,
[@willeasp](https://github.com/willeasp), privately on GitHub with what you
found and how to reproduce it.

## What Msgr protects

**Who can get in.** Sign-up is invite-only. An invite is a single-use link
that lasts a week, holding 128 random bits; the database stores only its
SHA-256 hash. Redeeming is one transaction, so an invite can't be spent twice.
Used, expired and made-up invites all look the same. Anyone can ask whether a
code still works (`inviteRedeemable`), so the invite page can say so before the
form; that tells a guesser nothing a sign-up attempt wouldn't.

**Passwords.** Hashed with bcrypt (cost 10). New passwords need at least 8
characters and at most 72 bytes, bcrypt's limit, so nothing is silently cut
off. Logins with an unknown email still check a password against a decoy hash,
so timing doesn't reveal which emails have accounts, and every login failure
reads the same.

**Guessing.** Each email gets 10 login attempts per 15 minutes.

**Sessions.** A signed JWT in an httpOnly, `SameSite=Lax` cookie, `Secure` in
production, valid for 30 days. Browsers never hold it anywhere JavaScript can
read. The same cookie authenticates the live WebSocket, and WebSockets opened
by any other site are refused.

**The page.** The app and API share one origin. Responses carry a
Content-Security-Policy that allows scripts, styles and connections only from
that origin, and media only from it or from `blob:` URLs the page made itself
(a video the viewer picked, played on their device to make a movie), and forbids framing, plus `X-Content-Type-Options: nosniff` and
`Referrer-Policy: same-origin`. Messages are rendered as text, never HTML.

**Pictures.** A photo is shrunk and dithered to 1 bit on the sender's device;
only that is uploaded, never the original or its metadata. The server takes a
picture's stated size (1 to 320 a side) only as a claim: it refuses a payload
longer than any honest picture of that size before decoding it, inflates it with
a hard cap at exactly the size's bytes, so a small DEFLATE bomb never expands in
memory, refuses a blank one, and stores its own compression, never the sender's
bytes. Browsers inflate under the same cap. WebSocket messages, which only
ever carry subscriptions, are capped at 64 KB; messages go over HTTP, where
bodies are capped at 1 MB, just above the largest honest movie. Avatars are pictures too, parsed the same way and
held to exactly 64×64. Only people who share a chat with someone are sent their
profile changes, though anyone signed in can read a name and avatar.

**Movies.** A video is cut, shrunk and dithered to 1 bit on the sender's device;
only those frames are uploaded, never the video or its sound or metadata, and the
page reads the file from disk as it plays, never whole into memory. The server
takes a movie's stated size (1 to 320 a side, 1 to 48 frames) only as a claim:
it refuses a payload longer than any honest movie of that size before decoding
it. Decoding reads exactly the frames the size says, whatever the bytes, so it
does a bounded amount of work and can't expand further. It refuses a movie blank
in every frame and stores its own coding, never the sender's bytes. Browsers
decode under the same bounds.

**Link previews.** Our server, not the reader's browser, fetches a page to
preview a link, so linked sites never see readers' addresses. Because anyone can
post a link, the fetcher is fenced in against server-side request forgery:
only `http` and `https` on ports 80 and 443; every address a name resolves to
must be public (no loopback, private, link-local, carrier-grade NAT, multicast or
reserved ranges, and no IPv4 hidden in IPv6), and the connection uses exactly
the addresses checked, so a second DNS answer can't redirect it; at most 3
redirects, each checked the same way; 5 seconds and 512 KB per page, 5 MB per
picture, at most 2 fetches at once. It sends no cookies and never logs URLs.
It only fetches the first link of a message the asker can already see, so it
can't be used to fetch anything else. Pages are read with plain scans of their
first 64 KB, never backtracking patterns, so a hostile page can't stall the
server. Pictures must be JPEG, PNG, WebP, GIF or AVIF of at most 4 megapixels,
checked from the header before `sharp` decodes them, and reach browsers only as
a 64×64 dithered bitmap.

**Privacy between users.** Only a chat's participants can read it; to anyone
else it answers exactly as if it didn't exist. The channel directory shows
names and participant counts, never messages or members.

**Notifications.** Pushes go only to the browser vendors' push services
(Google, Mozilla, Apple, Microsoft); an endpoint anywhere else is refused
before it's stored, so Msgr can't be made to call an internal address. Each
payload is encrypted for its one browser. A browser notifies one user at a
time: logging out removes it, and signing in moves it to whoever signed in.

## Known limits

- **No server-side logout.** Logging out clears the cookie, but a copied
  session token stays valid until it expires. Rotating `JWT_SECRET` signs
  everyone out.
- **Lockout by throttle.** Someone who knows your email can lock it out of
  logging in for 15 minutes. The throttle lives in memory and resets when the
  server restarts.
- **Not end-to-end encrypted.** Messages are encrypted in transit (HTTPS) but
  stored readable in the database. Whoever runs the server, or holds its
  database, can read them.
- **Push services see metadata.** They can't read a notification, but they see
  when Msgr sends one, and to which browser. A browser whose session simply
  expires, without logging out, keeps getting its user's notifications until
  someone signs in there or turns them off.
- **Channel names are public** to every user, and anyone can join any channel.
  Anyone in a channel can also add anyone else, who is notified; they can't
  refuse, only leave.
- **Linked sites see our server.** A page in a link is fetched by the server
  when someone first sees it, which tells that site the link was shared
  (from Render's address, with no cookies or personal data).
- **No account recovery or deletion** yet.

## Running it safely

- Set a long random `JWT_SECRET` (Render generates one) and never commit it.
- Set `CORS_ORIGIN` to the exact address people use, or let Render provide it.
- Serve over HTTPS only; Render does by default.
