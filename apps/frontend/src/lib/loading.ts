/*
 * Parts of the app that load the first time they're needed (dialogs, pages)
 * can fail to arrive: offline before the shell keeps them, or replaced by a
 * newer version the server now has instead.
 */

/** What each browser says, and Vite for a part's stylesheet. */
const FAILED_TO_LOAD = [
  /Failed to fetch dynamically imported module/i, // Chromium
  /error loading dynamically imported module/i, // Firefox
  /Importing a module script failed/i, // Safari
  /Unable to preload CSS/i, // Vite
];

/** Whether `error` is a part of the app that couldn't be loaded, not a bug in one. */
export const isLoadFailure = (error: unknown): boolean =>
  error instanceof Error &&
  FAILED_TO_LOAD.some((pattern) => pattern.test(error.message));
