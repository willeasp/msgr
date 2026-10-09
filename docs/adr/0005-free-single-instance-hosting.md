# 5. Free, single-instance hosting

Date: 2026-10-09 · Status: accepted

## Context

The goal is to run Msgr for friends at no cost and without a credit card. In
2026, Fly.io has no free tier, Koyeb's needs a card, and Render's free
database expires after 30 days. App builders such as Lovable can't run a
long-lived Node server with WebSockets, so moving there would mean rewriting
the API.

## Decision

- Ship one Docker image that migrates the database on start and serves the
  app and API (see ADR 2).
- Run it on Render's free web service (`render.yaml`), with Postgres on Neon's
  free plan, which doesn't expire.
- Stay a single instance: the live feed uses an in-process `PubSub` and the
  login throttle counts in memory.

## Consequences

- $0 to run, and any host that runs a container works the same way.
- The free service sleeps after 15 minutes without visitors; the next visit
  takes about a minute, and open tabs reconnect by themselves. Opening a chat
  refetches its history, so messages sent meanwhile appear; the chat list
  catches up on reload.
- Desktop notifications only arrive while Msgr is open in a tab; notifying a
  closed browser would need Web Push and the browser vendors' push services.
- To run more than one instance, replace the `PubSub` with a shared
  `PubSubEngine` and move the throttle to the database or Redis.
