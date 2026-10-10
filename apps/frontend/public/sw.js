// Msgr's service worker: opens the chat a notification is about. Plain
// JavaScript, served as-is from the site's root so its scope is the whole app.
/* eslint-disable no-restricted-globals -- a service worker's global is `self` */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) =>
  event.waitUntil(self.clients.claim())
);

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
