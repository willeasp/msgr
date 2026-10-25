# 16. A message is sent under an id its sender chose

Date: 2026-10-25 · Status: accepted

## Context

Sending waited for the server: the composer showed "Sending", a second
message couldn't follow, and a failure kept the words in the field. PR 6
asked for sends that show the moment Send is pressed, with the wristwatch
until the server has them, and "Not Sent." with Try Again when they don't
get there (the plan's answer 8).

A message shown before the server has it must become the stored one
without showing twice or flickering. The answer to the send and the
live feed's copy of the same message race each other, and either can come
first. And a send whose answer is lost, on a phone between networks, may
have been stored: trying again must not post it twice.

## Decision

- **The sender chooses the id.** The client makes a version 4 UUID
  (`chosenId`, `lib/outbox.ts`, from `crypto.getRandomValues`, which a page
  served over plain http has too) and sends it with the message
  (`SendMessageInput.id`); the server stores the message under it
  (`MessageId.parseChosen`, which takes nothing else, so never one shaped like
  its own cuids). The history shows the stored message in place of the one on
  its way the moment it holds that id, whether the answer or the feed brought
  it (`waitingIn`).
- **Sending again returns what's stored.** The server tries to store first;
  if the id is already a message's (the database's unique key says so, at
  once, however many tries race), the sender's own in that chat answers with
  that message, stored and delivered once (`MessageService.send`). Anyone
  else's id, or one from another chat, is refused as taken. So Try Again is
  always safe, whatever became of the last try.
- **An outbox on the page** (`app/data/outbox.ts`) holds what was sent until
  its history holds it: shown at once from what's on the device (a picture,
  movie or sound kept under an address of its own), sent one after another
  per chat (so they're stored in the order sent), after the last typing
  notice or 2 seconds, whichever is sooner. A message is on its way, not
  sent, or stored, and only moves forward (`moved`): whichever says it's
  stored first, the answer or the feed's copy, wins, and a late failure
  changes nothing. It shows until the history drawn holds it, never
  sooner, so it can't blink out between the two; stored after the history
  was fetched, it goes into the history in its place (`withStored`), so
  what arrives later goes after it. It's given up on a minute after it was
  sent, and as long again as its bytes take at 16 kB a second
  (`sendAllowance`), however long it waited its turn, so a stuck send can't
  hold the ones behind it for minutes each.
- **A session's sends are its own.** Login, sign-up and logout forget the
  outbox before they ask the server, aborting any send on its way, and an
  answer that lands afterwards writes nothing: the mutation doesn't write the
  cache itself (`no-cache`), `recordMessage` does, only while the session it
  was sent in lasts. Nothing the last person sent can go, or show, as the
  next, from this tab: another tab signing in as someone else changes the
  cookie under it, and what this tab sends afterwards goes as them, as any
  request would.

## Consequences

- Ids are no longer all the server's: a UUID beside a cuid. Both are
  opaque strings, ordered by `(createdAt, id)` as before.
- "That message id is taken" tells whoever sends a known id that a message
  has it, and nothing more; ids aren't shown to anyone outside their chat, and
  122 random bits can't be guessed.
- Nothing is kept across a reload: a message not sent when the page goes is
  gone (sending offline stays out of scope).
- A message tried again after others were sent is stored after them, and
  shows after them as soon as it's tried (`sendingAgain` puts it last).
- A kept shell one version behind sends no id and is served as before. The
  other way round, a shell newer than its server (a rollback) sends an id the
  old schema refuses: every send says "Not Sent." until the shell updates,
  which it does on its next load.
- Words over 4,000 characters, which the server would refuse, stay in the
  composer with the reason (`tooLong`), rather than becoming a message that
  can never be sent.
