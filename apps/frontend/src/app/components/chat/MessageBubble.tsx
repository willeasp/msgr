import { formatTime } from '../../../lib/utils/time';
import ActionButton from '../../../sacred/components/ActionButton';
import Message from '../../../sacred/components/Message';
import MessageViewer from '../../../sacred/components/MessageViewer';
import { isOnlyEmoji } from '../../../lib/emoji';
import { firstLink, splitLinks } from '../../../lib/links';
import { PixelText } from '../PixelText';
import { DrawingPicture } from './DrawingPicture';
import { LinkPreviewCard } from './LinkPreviewCard';
import styles from './MessageBubble.module.css';

interface MessageBubbleProps {
  message: {
    id: string;
    content?: string | null;
    drawing?: string | null;
    sender: {
      id: string;
      name: string;
    };
    createdAt: string;
  };
  isCurrentUser: boolean;
  /** Label the bubble with its sender and time; off for follow-ups in a run. */
  showMeta: boolean;
  /** Opens the paint window on a drawing; offered under each one. */
  onDrawOnIt?: (drawing: string) => void;
}

/** The viewer's own messages sit right in the accent colour, others' left. */
export function MessageBubble({
  message,
  isCurrentUser,
  showMeta,
  onDrawOnIt,
}: MessageBubbleProps) {
  const Bubble = isCurrentUser ? MessageViewer : Message;
  const { drawing } = message;
  const content = message.content ?? '';

  return (
    <>
      {showMeta && (
        <div className={isCurrentUser ? styles.metaOwn : styles.meta}>
          <span className={styles.sender}>
            {isCurrentUser ? 'You' : <PixelText text={message.sender.name} />}
          </span>
          <time className={styles.time} dateTime={message.createdAt}>
            {formatTime(message.createdAt)}
          </time>
        </div>
      )}
      {drawing == null && firstLink(content) && (
        <div className={isCurrentUser ? styles.metaOwn : styles.meta}>
          <LinkPreviewCard messageId={message.id} />
        </div>
      )}
      <Bubble>
        {drawing != null ? (
          <DrawingPicture drawing={drawing} />
        ) : (
          <span
            className={styles.content}
            title={new Date(message.createdAt).toLocaleString()}
          >
            {isOnlyEmoji(content) ? (
              <PixelText text={content} size={32} />
            ) : (
              splitLinks(content).map((piece, i) =>
                'link' in piece ? (
                  <a
                    key={i}
                    className={styles.link}
                    href={piece.link}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {piece.link}
                  </a>
                ) : (
                  <PixelText key={i} text={piece.text} />
                )
              )
            )}
          </span>
        )}
      </Bubble>
      {/* Under the bubble, not in it: the viewer's bubbles are inverted. */}
      {drawing != null && onDrawOnIt && (
        <div className={isCurrentUser ? styles.metaOwn : styles.meta}>
          <ActionButton onClick={() => onDrawOnIt(drawing)}>
            Draw on It
          </ActionButton>
        </div>
      )}
    </>
  );
}
