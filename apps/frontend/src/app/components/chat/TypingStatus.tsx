import { typingLine } from '../../../lib/typing';
import { useMovieTick } from '../../hooks/use-movie';
import { WATCH } from '../icons';
import { PixelIcon } from '../PixelIcon';
import { PixelText } from '../PixelText';
import styles from './TypingStatus.module.css';

/** Two of the movies' ticks to each place of the hand: round in two seconds. */
const watchAt = (tick: number) =>
  WATCH[Math.floor(tick / 2) % WATCH.length] ?? [];

/**
 * "Ana is typing…" beside the classic wristwatch, its hand going round, for
 * the chat window's title bar. It keeps still for anyone who asked for less
 * motion, as the movies do. Always there, empty, so screen readers hear it
 * when someone starts.
 */
export function TypingStatus({ names }: { names: readonly string[] }) {
  const line = typingLine(names);
  const tick = useMovieTick(line !== null);
  return (
    <span role="status" className={line ? styles.typing : undefined}>
      {line && (
        <>
          <PixelIcon bitmap={watchAt(tick)} scale={1} />
          <span className={styles.line}>
            <PixelText text={line} />
          </span>
        </>
      )}
    </span>
  );
}
