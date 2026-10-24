import { typingLine } from '../../../lib/typing';
import { useTypingIn, type Typists } from '../../hooks/use-typing';
import { PixelText } from '../PixelText';
import { Wristwatch } from '../Wristwatch';
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
  return (
    <span
      role="status"
      aria-label="Typing"
      className={line ? styles.typing : undefined}
    >
      {line && (
        <>
          <Wristwatch />
          <span className={styles.line}>
            <PixelText text={line} />
          </span>
        </>
      )}
    </span>
  );
}
