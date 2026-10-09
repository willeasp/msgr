# 3. Invite-only accounts

Date: 2026-10-09 · Status: accepted

## Context

Msgr is for people who know each other, hosted on the open internet. There was
no way to create an account at all.

## Decision

- People join only through an invite: a single-use link that lasts a week. Any
  user can make one (File → Invite a Friend…); the first comes from
  `npm run invite`.
- A code is 128 random bits. The database stores only its SHA-256 hash, so a
  leaked database cannot sign anyone up.
- Redeeming is one transaction: claim the invite with a conditional update,
  create the user, link them. Concurrent redemptions can't both succeed, and a
  taken email leaves the invite unspent.
- A used, expired or made-up code all answer the same way, and are rejected
  before the password is hashed, so junk costs nothing.
- Login is throttled per email (10 tries per 15 minutes) and sessions last 30
  days.

## Consequences

- No public sign-up page to attack, and no email verification needed.
- The throttle lets someone lock a known email out for 15 minutes. Acceptable
  among friends; revisit if that changes.
- Sessions are stateless JWTs: logging out clears the cookie but can't revoke a
  copied token before it expires. Rotating `JWT_SECRET` signs everyone out.
