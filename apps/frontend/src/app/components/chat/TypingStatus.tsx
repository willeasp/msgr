import { typingLine } from '../../../lib/typing';
import { useMovieTick } from '../../hooks/use-movie';
import { useTypingIn, type Typists } from '../../hooks/use-typing';
import { watchAt } from '../icons';
import { PixelIcon } from '../PixelIcon';
import { PixelText } from '../PixelText';
import styles from './TypingStatus.module.css';

/**
 * "Ana is typing…" beside the classic wristwatch, its hand going round, for
 * the chat window's title bar. It keeps still for anyone who asked for less
 * motion, as the movies do. Always there, empty, so screen readers hear it
 * when someone starts; named, to tell it from the window's loading status.
 */
export function TypingStatus({
  typists,
  chatId,
}: {
  typists: Typists;
  chatId: string;
}) {
  const line = typingLine(useTypingIn(typists, chatId));
  const tick = useMovieTick(line !== null);
  return (
    <span
      role="status"
      aria-label="Typing"
      className={line ? styles.typing : undefined}
    >
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
