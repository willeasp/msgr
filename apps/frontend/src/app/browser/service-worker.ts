/*
 * The service worker (public/sw.js): the app's shell kept on this device, and
 * the notifications it shows. The only code that talks to it.
 */

/** How often, at most, a page that comes back looks for a new version. */
const CHECK_EVERY_MS = 10 * 60 * 1000;

let updated = false;
const listeners = new Set<() => void>();

/**
 * Installs /sw.js. A new version takes over open pages at once (sw.js); a page
 * that sees that happen is running an older Msgr than the one now installed,
 * which `updateReady` then says.
 */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  const { serviceWorker } = navigator;
  let controlled = serviceWorker.controller !== null;
  serviceWorker.addEventListener('controllerchange', () => {
    // The first worker taking over a page it didn't load isn't an update.
    if (controlled && !updated) {
      updated = true;
      listeners.forEach((listener) => listener());
    }
    controlled = true;
  });

  serviceWorker
    .register('/sw.js')
    .then((registration) => {
      // An app on the Home Screen comes back for days without loading again:
      // look for a new version whenever it does.
      let checked = Date.now();
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;
        if (Date.now() - checked < CHECK_EVERY_MS) return;
        checked = Date.now();
        registration.update().catch(() => undefined);
      });
    })
    .catch(() => undefined);
}

/** Whether a newer Msgr has been installed since this page loaded. */
export const updateReady = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  get: (): boolean => updated,
};

/** Loads the newer Msgr, from the shell on this device. */
export const restartToUpdate = (): void => window.location.reload();

/** Listens for what the service worker tells this page; returns the way to stop. */
export function onServiceWorkerMessage(
  listener: (data: unknown) => void
): () => void {
  if (!('serviceWorker' in navigator)) return () => undefined;
  const onMessage = (event: MessageEvent) => listener(event.data);
  navigator.serviceWorker.addEventListener('message', onMessage);
  return () =>
    navigator.serviceWorker.removeEventListener('message', onMessage);
}

/** Whether the shell answers this page: every part of Msgr is on the device. */
export const keptOnDevice = (): boolean =>
  'serviceWorker' in navigator && navigator.serviceWorker.controller !== null;
