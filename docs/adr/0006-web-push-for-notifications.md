# 6. Web Push for notifications

Date: 2026-10-10 · Status: accepted

## Context

Notifications came from the page (`new Notification`). They arrived only while
Msgr was open in a tab, Android Chrome refused them outright, and iPhones never
had them. Phones freeze a background tab within seconds, so on a phone they
hardly ever came.

## Decision

- Notify with Web Push (VAPID, through `web-push`) on every browser that
  subscribes, desktop and phone alike. The page no longer shows notifications
  itself; it beeps and counts unread messages in the tab.
- The server decides who gets a push: every participant except the sender,
  skipping anyone _watching_ that chat. A visible page holds a `watching`
  subscription for the chat it shows. The service worker shows every push it
  receives.
- Make Msgr installable (manifest, icons, service worker), because iOS allows
  Web Push only in a Home Screen app. Offer notifications once per device.
- Push only to the browser vendors' push services, because the server POSTs
  wherever an endpoint points.

## Consequences

- Notifications arrive with Msgr closed. ADR 5's "only while open" no longer
  holds.
- WebKit revokes a subscription after a few pushes that show nothing. That's
  why the server, not the service worker, skips the chat you're looking at.
  Watching lives in process memory, like the `PubSub`, so Msgr stays a single
  instance.
- Payloads carry the message text, encrypted for the one browser (RFC 8291).
  Apple, Google, Mozilla and Microsoft relay them without being able to read
  them, but they see when pushes are sent and how big they are.
- Without VAPID keys, push is off and Msgr works as before, minus
  notifications. Rotating the keys means everyone turns notifications on again.
- Browsers that can't reach a push service (Brave with Google's push services
  off) get no notifications.
