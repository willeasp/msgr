import { useSyncExternalStore } from 'react';

/*
 * The page's one clock. Everything that shows or measures the time reads it,
 * so the menu bar and every "5m ago" always agree. It ticks on the minute and
 * re-reads the device's time on waking, when timers have been paused.
 */
let now = new Date();
const listeners = new Set<() => void>();

function tick() {
  now = new Date();
  for (const listener of listeners) listener();
}

let timer: number | undefined;
function schedule() {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    tick();
    schedule();
  }, 60_000 - (Date.now() % 60_000));
}

function wake() {
  if (document.visibilityState !== 'visible') return;
  tick();
  schedule();
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) {
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('pageshow', wake);
    window.addEventListener('focus', wake);
    wake();
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    window.clearTimeout(timer);
    document.removeEventListener('visibilitychange', wake);
    window.removeEventListener('pageshow', wake);
    window.removeEventListener('focus', wake);
  };
}

/** The current time, updated on the minute and on waking. */
export const useClock = (): Date => useSyncExternalStore(subscribe, () => now);
