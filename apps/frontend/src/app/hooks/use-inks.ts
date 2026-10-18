import { useSyncExternalStore } from 'react';
import type { Inks } from '../../lib/pixels';
import { THEME_CHANGED } from '../../lib/theme';

/** The screen's ink and paper, and the tones pictures keep on it. */
export interface ThemeInks {
  readonly screen: Inks;
  readonly picture: Inks;
}

function read(): ThemeInks {
  const style = getComputedStyle(document.body);
  const get = (name: string) => style.getPropertyValue(name).trim();
  return {
    screen: { ink: get('--ink'), paper: get('--paper') },
    picture: { ink: get('--picture-ink'), paper: get('--picture-paper') },
  };
}

let inks: ThemeInks | null = null;
const listeners = new Set<() => void>();

function changed() {
  inks = read();
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) window.addEventListener(THEME_CHANGED, changed);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener(THEME_CHANGED, changed);
      inks = null;
    }
  };
}

/**
 * The theme's colours, for what is drawn as an image rather than styled by
 * CSS (faces), so a tint reaches it too. Re-read whenever the theme changes.
 */
export const useInks = (): ThemeInks =>
  useSyncExternalStore(subscribe, () => (inks ??= read()));
