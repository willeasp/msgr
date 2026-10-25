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
  // One box, however many it holds: a phone's info line lays out its parts.
  return (
    <span className={styles.says}>
      <Saying
        label="Connection"
        words={reconnecting ? 'Reconnecting…' : null}
      />
      {/* Nobody's typing reaches a page that's lost its connection. */}
      <Saying
        label="Typing"
        words={typing && !reconnecting ? <PixelText text={typing} /> : null}
      />
    </span>
  );
}

/** One thing the title bar can say, beside the watch: always there, empty when there's nothing to say. */
function Saying({ label, words }: { label: string; words: React.ReactNode }) {
  return (
    <span
      role="status"
      aria-label={label}
      className={words ? styles.status : undefined}
    >
      {words && (
        <>
          <Wristwatch />
          <span className={styles.line}>{words}</span>
        </>
      )}
    </span>
  );
}
