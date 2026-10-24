/**
 * How long ago `date` was, as of `now` ("Just now", "5m ago", "2d ago").
 * `now` comes from `useClock`, so every time on screen agrees with the clock.
 */
export function formatTime(date: Date | string, now: Date): string {
  const d = new Date(date);
  const diff = now.getTime() - d.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  return d.toLocaleDateString();
}

/** The time of day, to the minute: "3:05 PM", as the device's locale says it. */
export function formatClock(date: Date | string, locale?: string): string {
  return new Date(date).toLocaleTimeString(locale, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Which day something happened, as a history heads it: "Today",
 * "Yesterday", "Tue, Oct 21", and with the year once it's another year's.
 * Days are counted on the device's calendar.
 */
export function formatDay(
  date: Date | string,
  now: Date,
  locale?: string
): string {
  const d = new Date(date);
  const day = (when: Date) =>
    new Date(when.getFullYear(), when.getMonth(), when.getDate()).getTime();
  const daysAgo = Math.round((day(now) - day(d)) / 86400000);
  if (daysAgo === 0) return 'Today';
  if (daysAgo === 1) return 'Yesterday';
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(locale, {
    weekday: sameYear ? 'short' : undefined,
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
  });
}

/**
 * When something happened, to the minute, the way Get Info says it: "Today,
 * 3:05 PM", "Yesterday, 9:12 AM", "Tue, Oct 21, 3:05 PM", and with the year
 * once it's another year's.
 */
export function formatStamp(
  date: Date | string,
  now: Date,
  locale?: string
): string {
  return `${formatDay(date, now, locale)}, ${formatClock(date, locale)}`;
}
