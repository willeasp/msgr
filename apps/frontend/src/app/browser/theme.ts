import {
  parseTheme,
  serializeTheme,
  themeClasses,
  type Theme,
} from '../../lib/theme';
import { keep, kept } from './storage';

/** The theme kept on this device, or the system's mode if none is. */
export function loadTheme(): Theme {
  return parseTheme(
    kept('theme'),
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

/** Fired on `window` whenever the theme changes, for what CSS can't repaint. */
export const THEME_CHANGED = 'msgr:theme-changed';

/**
 * Puts the theme on <body>, and the browser's bars around the page (a phone's
 * status bar, Safari's) in its paper; with `save`, keeps it for the next visit.
 */
export function applyTheme(theme: Theme, { save = false } = {}): void {
  const { classList } = document.body;
  for (const name of Array.from(classList)) {
    if (name.startsWith('theme-') || name.startsWith('tint-')) {
      classList.remove(name);
    }
  }
  classList.add(...themeClasses(theme));
  const paper = getComputedStyle(document.body).getPropertyValue('--paper');
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', paper.trim());
  if (save) keep('theme', serializeTheme(theme));
  window.dispatchEvent(new Event(THEME_CHANGED));
}
