/*
 * Everything Msgr keeps in this browser, and under which key: the only
 * place that touches `localStorage`. The keys are what's stored on people's
 * devices, so they never change; the e2e presets `notifications-dismissed`.
 * A browser that refuses storage (Safari's private mode can) reads as
 * nothing kept, and keeps nothing.
 */

const KEYS = {
  /** The theme chosen from the View menu (`lib/theme.ts`). */
  theme: 'theme',
  /** Whether the beep is on (`lib/alerts.ts`). */
  alerts: 'alerts',
  /** Said Not Now, or OK, to the notifications offer on this device. */
  notificationsDismissed: 'notifications-dismissed',
} as const;

export type Kept = keyof typeof KEYS;

/** What's kept under `what`, or null. */
export function kept(what: Kept): string | null {
  try {
    return localStorage.getItem(KEYS[what]);
  } catch {
    return null;
  }
}

/** Keeps `value` under `what`, if the browser lets it. */
export function keep(what: Kept, value: string): void {
  try {
    localStorage.setItem(KEYS[what], value);
  } catch {
    // Not kept: the next visit starts from the defaults.
  }
}
