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
