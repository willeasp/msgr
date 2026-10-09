import { formatTime } from '../../../lib/utils/time';
import Message from '../../../sacred/components/Message';
import MessageViewer from '../../../sacred/components/MessageViewer';
import styles from './MessageBubble.module.css';

interface MessageBubbleProps {
  message: {
    id: string;
    content: string;
    sender: {
      id: string;
      name: string;
    };
    createdAt: string;
  };
  isCurrentUser: boolean;
  /** Label the bubble with its sender and time; off for follow-ups in a run. */
  showMeta: boolean;
}

/** The viewer's own messages sit right in the accent colour, others' left. */
export function MessageBubble({
  message,
  isCurrentUser,
  showMeta,
}: MessageBubbleProps) {
  const Bubble = isCurrentUser ? MessageViewer : Message;

  return (
    <>
      {showMeta && (
        <div className={isCurrentUser ? styles.metaOwn : styles.meta}>
          <span className={styles.sender}>
            {isCurrentUser ? 'You' : message.sender.name}
          </span>
          <time className={styles.time} dateTime={message.createdAt}>
            {formatTime(message.createdAt)}
          </time>
        </div>
      )}
      <Bubble>
        <span
          className={styles.content}
          title={new Date(message.createdAt).toLocaleString()}
        >
          {message.content}
        </span>
      </Bubble>
    </>
  );
}
