import webpush from 'web-push';
import type { PushSender } from '../application/ports.js';

/** Sends with `web-push`, signed with Msgr's VAPID keys. */
export function createWebPushSender(vapid: {
  readonly subject: string;
  readonly publicKey: string;
  readonly privateKey: string;
}): PushSender {
  return {
    async send({ endpoint, p256dh, auth }, notification) {
      try {
        await webpush.sendNotification(
          { endpoint, keys: { p256dh, auth } },
          JSON.stringify(notification),
          // Held a day for a phone that's off; delivered at once when it's on.
          { vapidDetails: vapid, TTL: 24 * 60 * 60, urgency: 'high' }
        );
        return 'sent';
      } catch (error) {
        // The browser unsubscribed, or its subscription expired.
        if (
          error instanceof webpush.WebPushError &&
          (error.statusCode === 404 || error.statusCode === 410)
        ) {
          return 'gone';
        }
        throw error;
      }
    },
  };
}

/** While push is off: nobody can subscribe, so there's nobody to send to. */
export const noPushSender: PushSender = { send: async () => 'sent' };
