# 2. One origin, one session cookie

Date: 2026-10-09 · Status: accepted

## Context

The session was an httpOnly cookie for HTTP, but WebSockets authenticated with
a token the app kept in `localStorage`, readable by any script that ever ran on
the page. The API and app also lived on different origins, which meant CORS and
a hard-coded API address in the frontend.

## Decision

- Serve the built app from the API's own address (`STATIC_DIR`); in
  development, Vite proxies `/graphql` to the API. The frontend uses relative
  URLs.
- Authenticate WebSockets with the same httpOnly cookie, read from the upgrade
  request. Non-browser clients may still pass the token as a connection
  parameter.
- Refuse WebSockets whose `Origin` isn't the app's own (`CORS_ORIGIN`), so no
  other site can open one that rides a visitor's cookie.
- Send a Content-Security-Policy that allows scripts, styles and connections
  only from the app's own origin, plus `X-Frame-Options`, `nosniff` and
  `Referrer-Policy`.

## Consequences

- No session token is ever reachable from JavaScript.
- One deployable unit; no CORS configuration in practice.
- Inline scripts are forbidden by the CSP: boot code lives in `public/boot.js`.
- `CORS_ORIGIN` must be the public address (on Render it defaults to
  `RENDER_EXTERNAL_URL`), or browsers' WebSockets are refused.
