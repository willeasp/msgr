import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@apollo/client/react';
import { gql } from '../../lib/__generated__';
import { keyBytes, notificationSetup } from '../../lib/push';
import { keep, kept } from '../browser/storage';

const PUSH_KEY = gql(`
  query PushKey {
    pushKey
  }
`);

const ENABLE_PUSH = gql(`
  mutation EnablePush($subscription: PushSubscriptionInput!) {
    enablePush(subscription: $subscription)
  }
`);

const DISABLE_PUSH = gql(`
  mutation DisablePush($endpoint: String!) {
    disablePush(endpoint: $endpoint)
  }
`);

/** This browser, as `notificationSetup` sees it. */
export const setup = notificationSetup({
  serviceWorker: 'serviceWorker' in navigator,
  pushManager: 'PushManager' in window,
  standalone: (navigator as Navigator & { standalone?: boolean }).standalone,
});

/** Someone said Not Now (or OK) to the offer on this device. */
export const offerDismissed = () => kept('notificationsDismissed') !== null;
export const dismissOffer = () => keep('notificationsDismissed', 'true');

/** This browser's push subscription, if it has one. */
async function browserSubscription(): Promise<PushSubscription | null> {
  if (setup !== 'push') return null;
  // Not `ready`, which never settles where the service worker couldn't install.
  const registration = await navigator.serviceWorker.getRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

function asInput(subscription: PushSubscription) {
  const { endpoint = '', keys = {} } = subscription.toJSON();
  return { endpoint, p256dh: keys['p256dh'] ?? '', auth: keys['auth'] ?? '' };
}

/** Stops this browser's notifications: on the server while still signed in, then in the browser. */
async function forget(disable: (endpoint: string) => Promise<unknown>) {
  const subscription = await browserSubscription();
  if (!subscription) return;
  await disable(subscription.endpoint).catch(() => undefined);
  await subscription.unsubscribe();
}

/**
 * Notifications by Web Push on this browser: whether they're on, and turning
 * them on or off. While they're on, every visit re-registers the browser for
 * whoever is signed in now.
 */
export function useNotifications() {
  const { data } = useQuery(PUSH_KEY);
  const pushKey = data?.pushKey ?? null;
  const [enablePush] = useMutation(ENABLE_PUSH);
  const [disablePush] = useMutation(DISABLE_PUSH);
  /** Null until the browser has said. */
  const [subscribed, setSubscribed] = useState<boolean | null>(null);

  useEffect(() => {
    browserSubscription()
      .then((subscription) => {
        setSubscribed(subscription !== null);
        // This browser now notifies whoever is signed in, never the person before.
        if (subscription) {
          enablePush({
            variables: { subscription: asInput(subscription) },
          }).catch(() => undefined);
        }
      })
      .catch(() => setSubscribed(false));
  }, [enablePush]);

  /**
   * Call from a click: asks the browser first. 'blocked' when the person or
   * browser says no; 'failed' when the browser can't subscribe.
   */
  const turnOn = async (): Promise<'on' | 'blocked' | 'failed'> => {
    if (!pushKey) return 'failed';
    if ((await Notification.requestPermission()) !== 'granted') {
      return 'blocked';
    }
    try {
      // Without a service worker, `ready` would never settle.
      if (!(await navigator.serviceWorker.getRegistration())) return 'failed';
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes(pushKey),
      });
      await enablePush({ variables: { subscription: asInput(subscription) } });
      setSubscribed(true);
      return 'on';
    } catch {
      return 'failed';
    }
  };

  const turnOff = async () => {
    await forget((endpoint) => disablePush({ variables: { endpoint } }));
    setSubscribed(false);
  };

  return { pushKey, subscribed, turnOn, turnOff };
}

/** Forgets this browser before logging out, so it stops notifying whoever was signed in. */
export function useForgetBrowser() {
  const [disablePush] = useMutation(DISABLE_PUSH);
  return () => forget((endpoint) => disablePush({ variables: { endpoint } }));
}
