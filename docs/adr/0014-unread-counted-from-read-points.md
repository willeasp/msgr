# 14. Unread is counted from read points

Date: 2026-10-24 · Status: accepted

## Context

The chat list shows how many messages each chat holds unread, and every push
carries its person's total for the app's badge. Unread is what others sent
after the last message the viewer read or sent there.

Reads were kept only as `ReadMark`s, one per advance, which Get Info needs to
say when each message was first read. A mark doesn't say which chat it's in,
so finding someone's last read in a chat meant walking the chat's messages
back from the newest, asking of each whether they had marked it, or walking
all of their marks. Measured on 40 chats of 5,000 messages: 30 ms for one
person's chat list, and 525 ms for the badge totals of a push to three, on
four cores; Render's free instance has about a tenth of one.

## Decision

- **A `ReadPoint` per person and chat**: the furthest message they've read
  there. `markRead` moves it, only ever forward, in the same statement that
  decides whether there's a new mark to keep; a migration fills it from the
  marks so far. Marks stay, for Get Info.
- **An index on `(senderId, chatId, createdAt, id)`** finds the last message
  someone sent to a chat at once: sending reads everything before it.
- **The count starts from the later of the two** and walks the chat's
  `(chatId, createdAt, id)` index, so it costs what's unread and no more.
- **No JIT for the app's role** (`ALTER ROLE CURRENT_USER SET jit = off`, a
  migration of its own). Postgres guessed a badge total dear enough to compile
  it, which took 20 ms against the query's 5.

The same chat list takes 2.5 ms; the badge totals of a push take 4 ms, or
31 ms when one of them has never read 40 full chats (171,000 messages to
count, which no index saves).

## Consequences

- A read now writes a point as well as, when it advances, a mark.
- The in-memory repositories still count from marks; the repository contract
  holds both to the same answers, and the migration's backfill was checked
  against the old count for every person in every chat of the measured data.
- Anyone running Msgr's database under another role keeps JIT for that role.
