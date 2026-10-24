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

/** A CSS colour as red, green, blue and alpha, 0 to 255 each. */
export type Rgba = readonly [number, number, number, number];

let pen: CanvasRenderingContext2D | null | undefined;
const resolved = new Map<string, Rgba | null>();

/**
 * Any colour CSS computes (`rgb(…)`, a tint's `oklch(…)`) as sRGB, by
 * painting it on a pixel of its own; null if the browser can't paint it.
 */
export function rgbaOf(css: string): Rgba | null {
  if (resolved.has(css)) return resolved.get(css) ?? null;
  pen ??= document
    .createElement('canvas')
    .getContext('2d', { willReadFrequently: true });
  if (!pen) return null;
  pen.clearRect(0, 0, 1, 1);
  pen.fillStyle = 'transparent'; // Kept if the browser can't read `css`.
  pen.fillStyle = css;
  pen.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0, a = 0] = pen.getImageData(0, 0, 1, 1).data;
  const rgba: Rgba | null =
    a === 0 && css !== 'transparent' ? null : [r, g, b, a];
  resolved.set(css, rgba);
  return rgba;
}

/**
 * The page's paper as `#rrggbb`, which every browser's bars take. A tint's
 * paper is worked out in CSS from its colour (`oklch(from …)`), which phones a
 * version or two behind paint but leave out of their bars. Null if the
 * browser can't say.
 */
function paperHex(): string | null {
  const paper = rgbaOf(getComputedStyle(document.body).backgroundColor);
  if (!paper || paper[3] !== 255) return null;
  return `#${paper
    .slice(0, 3)
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('')}`;
}
