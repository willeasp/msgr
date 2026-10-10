// Msgr's service worker: shows pushed notifications and opens the chat they're
// about. Plain JavaScript, served as-is from the site's root so its scope is
// the whole app.
/* eslint-disable no-restricted-globals -- a service worker's global is `self` */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) =>
  event.waitUntil(self.clients.claim())
);

self.addEventListener('push', (event) => {
  // Show every push: iOS takes away the subscription of a site whose pushes show nothing.
  const { title, body, chatId } = event.data.json();
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: chatId,
      renotify: true,
      icon: '/icon-192.png',
      data: { chatId },
    })
  );
});

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
