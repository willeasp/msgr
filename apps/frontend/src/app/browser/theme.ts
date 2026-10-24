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
  const paper = paperHex();
  if (paper) {
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', paper);
  }
  if (save) keep('theme', serializeTheme(theme));
  window.dispatchEvent(new Event(THEME_CHANGED));
}

/**
 * The page's paper as `#rrggbb`, which every browser's bars take. A tint's
 * paper is worked out in CSS from its colour (`oklch(from …)`), which phones a
 * version or two behind paint but leave out of their bars. Null if the
 * browser can't say.
 */
function paperHex(): string | null {
  const pen = document
    .createElement('canvas')
    .getContext('2d', { willReadFrequently: true });
  if (!pen) return null;
  pen.fillStyle = 'transparent'; // Kept if the browser can't read the paper.
  pen.fillStyle = getComputedStyle(document.body).backgroundColor;
  pen.fillRect(0, 0, 1, 1);
  const [r, g, b, alpha] = pen.getImageData(0, 0, 1, 1).data;
  if (alpha !== 255) return null;
  return `#${[r, g, b]
    .map((n) => (n ?? 0).toString(16).padStart(2, '0'))
    .join('')}`;
}
