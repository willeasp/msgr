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
Used, expired and made-up invites all look the same.

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
that origin and forbids framing, plus `X-Content-Type-Options: nosniff` and
`Referrer-Policy: same-origin`. Messages are rendered as text, never HTML.

**Privacy between users.** Only a chat's participants can read it; to anyone
else it answers exactly as if it didn't exist. The channel directory shows
names and participant counts, never messages or members.

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
- **Channel names are public** to every user, and anyone can join any channel.
- **No account recovery or deletion** yet.

## Running it safely

- Set a long random `JWT_SECRET` (Render generates one) and never commit it.
- Set `CORS_ORIGIN` to the exact address people use, or let Render provide it.
- Serve over HTTPS only; Render does by default.
