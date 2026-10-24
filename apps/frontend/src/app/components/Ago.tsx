import { formatTime } from '../../lib/time';
import { useClock } from '../hooks/use-clock';

/**
 * How long ago `date` was ("5m ago"), kept current by the page's one clock.
 * The only part of a message or a chat's row that reads the clock, so its
 * tick redraws these words and nothing around them.
 */
export function Ago({ date, className }: { date: string; className?: string }) {
  const now = useClock();
  return (
    <time className={className} dateTime={date}>
      {formatTime(date, now)}
    </time>
  );
}
