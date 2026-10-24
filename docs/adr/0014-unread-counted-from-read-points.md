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
all of their marks; and the count then walked every message after it.
Measured on 40 chats of 5,000 messages, on four cores (Neon's free compute
has a fraction of one): 30 ms for one person's chat list, 42 ms for someone
who had never opened them, and 525 ms for the badge totals of a push to three.

## Decision

- **A `ReadPoint` per person and chat**: the furthest message they've read
  there. `markRead` moves it, only ever forward, and keeps a mark only when it
  moves, in one statement. A migration fills it from the marks so far, and
  starts everyone after what their chats held before marks were kept
  (2026-10-21), when nothing counted as unread. Marks stay, for Get Info.
- **Joining starts a newcomer just before the newest message**
  (`startReading`, from `joinChannel` and `addToChannel`), so a channel's
  history isn't theirs to catch up on and its latest waits for them, unread.
  Someone already in it keeps their place.
- **An index on `(senderId, chatId, createdAt, id)`** finds the last message
  someone sent to a chat at once: sending reads everything before it.
- **The count starts from the later of the two** and walks the chat's
  `(chatId, createdAt, id)` index, **no further than 100** (`UNREAD_LIMIT`):
  the list says "99+" past 99, and a channel someone never opens would
  otherwise cost what it holds.
- **No JIT for the app's role in its database** (a migration of its own, run
  first). Postgres guessed a badge total dear enough to compile it, which took
  20 ms against the query's 5.

The same chat list takes 1.8 ms, and 1.7 ms for someone who never opened any
of them; the badge totals of a push to three take 3.2 ms.

## Consequences

- A read writes its point and, when it advances, a mark.
- The in-memory repositories keep the same places; the repository contract
  holds both adapters to the same answers. The backfill from marks was
  checked against the old count for every person in every chat of the
  measured data.
- A count is exact up to 100; the badge sums each chat's.
- While a deploy migrates, the outgoing release still answers, and a read it
  takes then keeps its mark but not its point, until that chat is read again.
- Anyone running Msgr's database under another role keeps JIT for that role.
