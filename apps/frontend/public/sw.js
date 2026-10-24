// Msgr's service worker. It keeps the app itself on the device, so Msgr opens
// at once with no network, even while the server wakes; and it shows pushed
// notifications and opens the chat they're about. Chats and messages are never
// kept here: they come from the server, as they always have.
//
// Plain JavaScript, served from the site's root so its scope is the whole app.
// The build writes in its VERSION and the SHELL to keep (vite.config.ts), so
// every build changes these bytes and browsers install it anew. Served by the
// development server as it is, it keeps nothing.
/* eslint-disable no-restricted-globals -- a service worker's global is `self` */

const VERSION = 'development';
const SHELL = [];

const PREFIX = 'msgr-shell-';
const CURRENT = PREFIX + VERSION;
/** Which shell is active and which was before it: `{ current, previous }`. */
const ACTIVE = ['msgr-active', '/msgr-active.json'];
/** Answered by the server alone, never from the shell: media included. */
const SERVER = ['/graphql', '/healthz', '/media/', '/avatars/'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      if (SHELL.length > 0) {
        const existed = await caches.has(CURRENT);
        try {
          await (await caches.open(CURRENT)).addAll(SHELL);
        } catch (error) {
          // Opening made it: an empty shell must never pass for a version.
          if (!existed) await caches.delete(CURRENT);
          throw error;
        }
      }
      // A new version takes over at once. Pages already open keep working:
      // the previous shell, with every asset they may still ask for, stays.
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) =>
  event.waitUntil(
    (async () => {
      // Keep this shell and the one it replaces, which pages already open
      // still run; said outright, since an update may fail or roll back.
      const meta = await caches.open(ACTIVE[0]);
      const was = await meta.match(ACTIVE[1]).then((answer) => answer?.json());
      const previous =
        was?.current === VERSION ? was.previous : was?.current ?? null;
      await meta.put(
        ACTIVE[1],
        new Response(JSON.stringify({ current: VERSION, previous }))
      );
      const keep = [CURRENT, PREFIX + previous];
      await Promise.all(
        (await caches.keys())
          .filter((name) => name.startsWith(PREFIX) && !keep.includes(name))
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  )
);

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (
    SHELL.length === 0 ||
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    SERVER.some((path) => url.pathname.startsWith(path))
  ) {
    return;
  }
  if (request.mode === 'navigate') {
    // Every page is the app, which routes itself: answer with this version's.
    event.respondWith(fromShell('/index.html', request));
  } else if (
    url.pathname.startsWith('/assets/') ||
    SHELL.includes(url.pathname)
  ) {
    event.respondWith(fromShell(request, request));
  }
});

/** What the shell keeps, from this version or the one before; else the network. */
async function fromShell(key, request) {
  const current = await (await caches.open(CURRENT)).match(key);
  return current ?? (await caches.match(key)) ?? fetch(request);
}

self.addEventListener('push', (event) => {
  // Show every push: iOS takes away the subscription of a site whose pushes show nothing.
  const { title, body, chatId, unread } = event.data.json();
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, {
        body,
        tag: chatId,
        renotify: true,
        icon: '/icon-192.png',
        data: { chatId },
      }),
      badge(unread),
    ])
  );
});

/** The app icon's number: how many messages wait unread, as the server counts them. */
async function badge(unread) {
  if (typeof unread !== 'number' || !('setAppBadge' in navigator)) return;
  try {
    await (unread > 0
      ? navigator.setAppBadge(unread)
      : navigator.clearAppBadge());
  } catch {
    // Not allowed: the notification shows anyway.
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const { chatId } = event.notification.data ?? {};
  event.waitUntil(
    (async () => {
      const [open] = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      if (!open) return self.clients.openWindow(chatId ? `/${chatId}` : '/');
      await open.focus();
      // The page routes there itself, without reloading.
      if (chatId) open.postMessage({ type: 'open-chat', chatId });
    })()
  );
});
