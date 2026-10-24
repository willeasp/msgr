import { useSyncExternalStore } from 'react';

/** Chrome's offer to install the app, held until someone takes it up. */
interface InstallOffer extends Event {
  prompt(): Promise<void>;
}

let offer: InstallOffer | null = null;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((listener) => listener());

// Listening from the moment the app loads: the event comes once, unasked.
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault(); // We offer it from the Special menu instead.
  offer = event as InstallOffer;
  changed();
});
window.addEventListener('appinstalled', () => {
  offer = null;
  changed();
});

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const available = () => offer !== null;

/**
 * Shows the browser's offer; each can be shown once. Out here, not in the
 * hook: the React Compiler treats a module's `let` as never changing inside
 * a component or hook, and read `offer` after clearing it.
 */
async function install() {
  const taken = offer;
  offer = null;
  changed();
  await taken?.prompt();
}

/** Installs Msgr as an app, where the browser offers to; undefined otherwise. */
export function useInstallPrompt(): (() => Promise<void>) | undefined {
  return useSyncExternalStore(subscribe, available) ? install : undefined;
}
