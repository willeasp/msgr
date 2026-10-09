# 4. Channels are a kind of chat

Date: 2026-10-09 · Status: accepted

## Context

We wanted IRC-style rooms (`#general`) that anyone can find and join, alongside
direct and group chats. The glossary had avoided the word "channel".

## Decision

- A channel is a third kind of `Chat` (`ChannelChat`, with a `name`), so
  messages, the live feed, activity ordering and the rule that only
  participants can read a chat all apply unchanged.
- Joining creates the channel if it doesn't exist; anyone signed in may join or
  leave. Names are lower-case letters, digits and dashes, and spaces become
  dashes.
- The directory of all channels has its own GraphQL type, `ChannelListing`
  (name, participant count, whether you've joined), never `Chat`, whose fields
  would expose messages and members to non-members.
- Joining and leaving are not activity: they connect through the user's side
  of the relation so the chat's `updatedAt` doesn't move.
- In the database, exactly one of `directKey`, `title` and `channelName` is set
  (a CHECK constraint), and `channelName` is unique.

## Consequences

- One code path for messages; channels came almost for free.
- Channel names and participant counts are visible to every user.
- Empty channels persist after their last member leaves.
