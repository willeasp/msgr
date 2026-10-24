# 15. A history keeps its place

Date: 2026-10-24 · Status: accepted

## Context

A chat's history opened on its newest 50 messages and stopped there, and it
followed every arrival to the end, wherever the viewer was reading. PR 6
asked it to behave like a messenger: fetch earlier pages as the viewer
reaches the top, leave a reader where they are while messages arrive, and
offer what arrived instead (the look chosen in the plan's answer 8).

Three things make that harder than it sounds:

- Content changes above the line being read: a page of earlier messages, the
  row that asks for it coming and going, a link's card answering late, a run
  whose first message moves (its name and time go to the new first). Chrome
  and Firefox anchor scrolling to what's in view; Safari, which an iPhone's
  Home Screen app runs on, has none.
- The cache holds each chat's history, open or not, and the feed appends
  every live message to it. Messages sent while the socket was down are
  lost to it, so a history can hold a gap that looks continuous: what was
  held, then one live message that arrived once the socket was back.
- Reading: a chat open on a visible page was read to its newest message, so
  arrivals a reader hadn't scrolled to counted as read.

## Decision

- **The history keeps the place itself** (`placeIn`, in `MessageList.tsx`),
  with the browser's anchoring off, so every browser behaves alike and
  Chromium's tests cover what Safari runs. Away from the end, it remembers
  the first message in view, by its words (`[data-message]`, not the whole
  message, whose name or card may come and go), and how far below the top
  it is; after every commit and every resize it scrolls by however far that
  moved. At the end it stays at the end, without animating, so a burst of
  arrivals can't leave it short. A message gone (the history started again)
  takes it to the newest, as if opened.
- **Away from the end is not reading.** The newest message seen at the end
  is what `useReading` marks read, and the feed counts arrivals unread while
  the history is away (`useAwayFromNewest`); a button counts them from
  others ("2 New Messages", `arrivedSince`) and takes the viewer down. Only a
  send from this window goes to the newest by itself, not one from the
  viewer's other device.
- **One unbroken history per chat in the cache** (`lib/cache.ts`). An
  earlier page joins only the history it was asked of; a newest page joins
  only if it holds everything held or reaches back into it, and otherwise
  the history starts again from it. After events may have been missed (the
  socket back, the page shown after a while away), `catchUp` marks every
  history whole only up to its newest message then (`mayHaveMissed`), so a
  live message appended after it can't make a gap look joined.
- **Only arrivals are read out.** The log isn't live itself: what it opened
  with and what arrives since are in a polite part; earlier pages go above
  it, silently. The log is focusable, so Home and Page Up reach earlier
  pages without a mouse.

## Consequences

- Scrolling reads the layout of a few messages per frame to find the one in
  view (a binary search); nothing renders while scrolling.
- A history that starts again drops what was held before the new page, so
  earlier pages are fetched again as the viewer goes back up.
- A chat of exactly 50 messages, or one read back to its first, asks once
  for an empty page each time it's opened: the window, not the cache, knows
  where a chat starts.
- iOS momentum scrolling meeting a correction can only be checked by hand
  (`docs/manual-testing.md`, section 5).
