const UNITS = ['KB', 'MB', 'GB', 'TB'] as const;

/** "512 bytes", "1.5 KB", "12 MB": counted in 1,024s, three figures at most. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes === 1 ? '1 byte' : `${bytes} bytes`;
  let size = bytes;
  let unit = -1;
  while (size >= 1024 && unit < UNITS.length - 1) {
    size /= 1024;
    unit++;
  }
  const figures = size < 10 ? 1 : 0;
  return `${Number(size.toFixed(figures))} ${UNITS[unit]}`;
}

/** How much of `whole` `part` fills, from 0 to 1; nothing of nothing. */
export function share(part: number, whole: number): number {
  return whole > 0 ? Math.min(1, Math.max(0, part / whole)) : 0;
}

/** What the admin page calls each kind of content. */
export const CONTENT_NAMES = {
  TEXT: 'Text',
  PICTURE: 'Pictures',
  MOVIE: 'Movies',
  SOUND: 'Sounds',
  AVATAR: 'Avatars',
} as const;
