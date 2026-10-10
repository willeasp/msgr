/** What a browser needs before Msgr can notify it with Msgr closed. */
export type NotificationSetup = 'push' | 'install-first' | 'unsupported';

export function notificationSetup(browser: {
  readonly serviceWorker: boolean;
  readonly pushManager: boolean;
  /** `navigator.standalone`: only iOS has it, and it's false in Safari, outside the Home Screen app. */
  readonly standalone: boolean | undefined;
}): NotificationSetup {
  if (browser.serviceWorker && browser.pushManager) return 'push';
  // iOS has Web Push only in a Home Screen app.
  return browser.standalone === false ? 'install-first' : 'unsupported';
}

/** Whether to offer notifications as the desktop opens. */
export function shouldOffer(state: {
  readonly setup: NotificationSetup;
  /** Null while the server has push off. */
  readonly pushKey: string | null;
  /** Null where there's no Notification API yet (iOS Safari). */
  readonly permission: NotificationPermission | null;
  readonly subscribed: boolean;
  readonly dismissed: boolean;
}): boolean {
  return (
    state.setup !== 'unsupported' &&
    state.pushKey !== null &&
    !state.subscribed &&
    state.permission !== 'denied' &&
    !state.dismissed
  );
}

/** A base64url VAPID key as the bytes `pushManager.subscribe` takes. */
export function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}
