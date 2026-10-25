import { typingLine } from '../../../lib/typing';
import { useReconnecting } from '../../hooks/use-reconnecting';
import { useTypingIn, type Typists } from '../../hooks/use-typing';
import { PixelText } from '../PixelText';
import { Wristwatch } from '../Wristwatch';
import styles from './ChatStatus.module.css';

/**
 * What the chat window's title bar says beside the classic wristwatch, its
 * hand going round (still for anyone who asked for less motion, as the
 * movies are): "Reconnecting…" once the live connection has been down a
 * moment, else "Ana is typing…". Each always there, empty, so screen
 * readers hear it when it starts; named, to tell them apart and from the
 * window's loading status.
 */
export function ChatStatus({
  typists,
  chatId,
}: {
  typists: Typists;
  chatId: string;
}) {
  const reconnecting = useReconnecting();
  const typing = typingLine(useTypingIn(typists, chatId));
  // Nobody's typing reaches a page that's lost its connection.
  const line = reconnecting ? null : typing;
  return (
    <>
      <span
        role="status"
        aria-label="Connection"
        className={reconnecting ? styles.status : undefined}
      >
        {reconnecting && (
          <>
            <Wristwatch />
            <span className={styles.line}>Reconnecting…</span>
          </>
        )}
      </span>
      <span
        role="status"
        aria-label="Typing"
        className={line ? styles.status : undefined}
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
    </>
  );
}
