/**
 * The Sacred Computer theme: a light or dark mode, optionally tinted. Sacred
 * reads it from classes on <body> (`theme-dark`, `tint-green`) and derives
 * every `--theme-*` colour from them.
 */
export const TINTS = [
  'green',
  'blue',
  'red',
  'yellow',
  'purple',
  'orange',
  'pink',
] as const;

export type Mode = 'light' | 'dark';
export type Tint = (typeof TINTS)[number];

export interface Theme {
  mode: Mode;
  tint: Tint | null;
}

const STORAGE_KEY = 'theme';

const isMode = (value: unknown): value is Mode =>
  value === 'light' || value === 'dark';

const isTint = (value: unknown): value is Tint =>
  TINTS.some((tint) => tint === value);

export function serializeTheme(theme: Theme): string {
  return JSON.stringify(theme);
}

/** The stored theme, or the system's mode, untinted, if none is stored. */
export function parseTheme(stored: string | null, prefersDark: boolean): Theme {
  const fallback: Theme = { mode: prefersDark ? 'dark' : 'light', tint: null };
  if (!stored) return fallback;

  try {
    const { mode, tint } = JSON.parse(stored) ?? {};
    if (isMode(mode) && (tint === null || isTint(tint))) return { mode, tint };
  } catch {
    // Unreadable: fall back.
  }
  return fallback;
}

export function themeClasses({ mode, tint }: Theme): string[] {
  return tint ? [`theme-${mode}`, `tint-${tint}`] : [`theme-${mode}`];
}

export function loadTheme(): Theme {
  return parseTheme(
    localStorage.getItem(STORAGE_KEY),
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

/** Puts the theme on <body> and remembers it for the next visit. */
export function applyTheme(theme: Theme, { save = false } = {}): void {
  const { classList } = document.body;
  for (const name of Array.from(classList)) {
    if (name.startsWith('theme-') || name.startsWith('tint-')) {
      classList.remove(name);
    }
  }
  classList.add(...themeClasses(theme));
  if (save) localStorage.setItem(STORAGE_KEY, serializeTheme(theme));
}
