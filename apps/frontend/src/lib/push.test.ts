import { describe, expect, it } from 'vitest';
import { keyBytes, notificationSetup, shouldOffer } from './push';

describe('notificationSetup', () => {
  it('pushes wherever the browser has a service worker and PushManager', () => {
    expect(
      notificationSetup({
        serviceWorker: true,
        pushManager: true,
        standalone: undefined,
      })
    ).toBe('push');
    // The Home Screen app on an iPhone.
    expect(
      notificationSetup({
        serviceWorker: true,
        pushManager: true,
        standalone: true,
      })
    ).toBe('push');
  });

  it('asks an iPhone in Safari to install Msgr first', () => {
    expect(
      notificationSetup({
        serviceWorker: true,
        pushManager: false,
        standalone: false,
      })
    ).toBe('install-first');
  });

  it('gives up anywhere else', () => {
    expect(
      notificationSetup({
        serviceWorker: false,
        pushManager: false,
        standalone: undefined,
      })
    ).toBe('unsupported');
    // A Home Screen app from before iOS 16.4.
    expect(
      notificationSetup({
        serviceWorker: true,
        pushManager: false,
        standalone: true,
      })
    ).toBe('unsupported');
  });
});

describe('shouldOffer', () => {
  const fresh = {
    setup: 'push' as const,
    pushKey: 'key',
    permission: 'default' as NotificationPermission | null,
    subscribed: false,
    dismissed: false,
  };

  it('offers on a device that could have notifications and has not said no', () => {
    expect(shouldOffer(fresh)).toBe(true);
    expect(shouldOffer({ ...fresh, permission: 'granted' })).toBe(true);
    expect(
      shouldOffer({ ...fresh, setup: 'install-first', permission: null })
    ).toBe(true);
  });

  it('does not offer when it could not work, is already on, or was turned down', () => {
    expect(shouldOffer({ ...fresh, setup: 'unsupported' })).toBe(false);
    expect(shouldOffer({ ...fresh, pushKey: null })).toBe(false);
    expect(shouldOffer({ ...fresh, subscribed: true })).toBe(false);
    expect(shouldOffer({ ...fresh, permission: 'denied' })).toBe(false);
    expect(shouldOffer({ ...fresh, dismissed: true })).toBe(false);
  });
});

describe('keyBytes', () => {
  it('decodes a VAPID public key into its 65 bytes', () => {
    const key =
      'BHdgRT9dGCZv-REtiHJtRv-vcQMexFE3rhRYq5_8EIqBR2zDLtUJ2SVOz2LBEq8Lone3iCmqO_W-uHT5C6eDLJ8';
    const bytes = keyBytes(key);

    expect(bytes).toHaveLength(65);
    expect(bytes[0]).toBe(4); // an uncompressed P-256 point
    expect(Buffer.from(bytes).toString('base64url')).toBe(key);
  });
});
