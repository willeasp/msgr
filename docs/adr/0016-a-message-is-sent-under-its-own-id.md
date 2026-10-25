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
  (`crypto.randomUUID()`) and sends it with the message
  (`SendMessageInput.id`); the server stores the message under it
  (`MessageId.parse`, which takes nothing else, so never one of its own
  cuids). The history shows the stored message in place of the one on its
  way the moment it holds that id, whether the answer or the feed brought
  it (`waitingIn`, `lib/outbox.ts`).
- **Sending again returns what's stored.** A send whose id the sender has
  already used in that chat answers with that message, stored and delivered
  once (`MessageService.send`). Anyone else's id, or one from another chat,
  is refused. So Try Again is always safe, whatever became of the last try.
- **An outbox on the page** (`app/data/outbox.ts`) holds what was sent and
  isn't stored yet: shown at once from what's on the device (a picture,
  movie or sound kept under an address of its own), sent one after another
  per chat (so they're stored in the order sent), after the last typing
  notice, and given up after 60 seconds without an answer. A session change
  forgets it.

## Consequences

- Ids are no longer all the server's: a UUID beside a cuid. Both are
  opaque strings, ordered by `(createdAt, id)` as before.
- Two sends of one new id at the same moment (a retry while the first is
  still on its way) can collide in the database; the second fails as a
  defect, and its Try Again returns the stored message.
- Nothing is kept across a reload: a message not sent when the page goes
  is gone (sending offline stays out of scope).
- A kept shell one version behind sends no id and is served as before.
