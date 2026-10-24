# 13. Phones keep the desktop's look

Date: 2026-10-24 · Status: accepted

## Context

At 760 pixels wide or less Msgr shows one window at a time, but otherwise it is the
desktop, narrowed: a close box 13 pixels square to go back, the chat's
people and Add People… squeezed into the line under its title, a tap on a
message (easily made while scrolling) opening Get Info, and on an iPhone a
keyboard that slides the whole page up, menu bar, title and the history's
newest messages off the screen.

The excellence run proposed a phone's layout to fix that (`docs/superpowers/
specs/2026-10-22-excellence-run-design.md`, PR 5): the window edge to edge,
the title bar navigating, a back swipe from the edge, the Mac's zoom
rectangles between a chat's row and its window, no clock in the menu bar,
thumb-sized menus and buttons (44 points), and a one-row composer of `[+]`,
the field and `[>]`. Built and shown side by side, the bigger buttons and the
reshaped composer read as a different, coarser app, not the Macintosh.

## Decision

Phones keep the desktop's look, chrome and controls at their size, and gain
only what a finger needs:

- **The title bar navigates.** The close box becomes `<` (Back), and an
  `(i)` (Info) at the right opens the chat's people and, in a channel,
  Add People… (`ChatInfoDialog`), which leave the line under the title to
  the count and who's typing. The Chats window's title bar offers New….
  Both are drawn as small as the close box; only their invisible targets are
  a thumb's size, 44 points, reaching down over the info line.
- **The composer stays on the keyboard.** The chats' screen is the part of
  the page a person can see (`visualViewport`, through
  `app/browser/viewport.ts` and `lib/viewport.ts`): above an iPhone's
  keyboard, which iOS lays over the page, and following the page as iOS slides
  it. Android resizes the page itself (`interactive-widget=resizes-content`).
  A pinch-zoomed page is left whole. The history stays at its end while the
  screen shrinks.
- **Get Info by holding.** With a finger, a message opens Get Info when held
  half a second (`lib/press.ts`, `useLongPress`), inverted once it has
  rested 150 milliseconds; a tap
  or a scroll past opens nothing. A mouse click opens it, as before.

Not taken, and why: edge to edge, the clock's removal, the swipe and the
zoom changed how the phone looks or moves without making it easier to use;
the thumb-sized controls and the one-row composer changed what every screen
looks like.

## Consequences

- `usePhone` (`app/hooks/use-phone.ts`) says when the screen is a phone's,
  the same 760 pixels as the CSS.
- The e2e suite gains two phone projects, Pixel 7 and iPhone 15, in
  Chromium (`apps/e2e/phone`), run by `npm run e2e`; they sign in as Frank and
  Grace, who are in no chat and so have logins to spare under the throttle
  (the seed adds Grace for them). A phone's own keyboard can't be
  shown there, so a spec puts up a pretend one through a stand-in
  `visualViewport` (`pretendKeyboard`); the real ones are checked by hand
  (`docs/manual-testing.md`).
- Selecting a message's words with a finger is gone, as holding one opens
  Get Info instead.
