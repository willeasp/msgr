import { formatTime } from '../../../lib/utils/time';
import { useClock } from '../../hooks/use-clock';
import ActionButton from '../../../sacred/components/ActionButton';
import Message from '../../../sacred/components/Message';
import MessageViewer from '../../../sacred/components/MessageViewer';
import { isOnlyEmoji } from '../../../lib/emoji';
import { firstLink, splitLinks } from '../../../lib/links';
import type { WirePicture } from '../../../lib/picture-wire';
import { PixelText } from '../PixelText';
import { MessagePicture } from './MessagePicture';
import { LinkPreviewCard } from './LinkPreviewCard';
import styles from './MessageBubble.module.css';

interface MessageBubbleProps {
  message: {
    id: string;
    content?: string | null;
    picture?: WirePicture | null;
    sender: {
      id: string;
      name: string;
    };
    createdAt: string;
  };
  isCurrentUser: boolean;
  /** Label the bubble with its sender and time; off for follow-ups in a run. */
  showMeta: boolean;
  /** Opens the paint window on a picture; offered under each one. */
  onDrawOnIt?: (picture: WirePicture) => void;
}

/** The viewer's own messages sit right in the accent colour, others' left. */
export function MessageBubble({
  message,
  isCurrentUser,
  showMeta,
  onDrawOnIt,
}: MessageBubbleProps) {
  const Bubble = isCurrentUser ? MessageViewer : Message;
  const now = useClock();
  const { picture } = message;
  const content = message.content ?? '';

  return (
    <>
      {showMeta && (
        <div className={isCurrentUser ? styles.metaOwn : styles.meta}>
          <span className={styles.sender}>
            {isCurrentUser ? 'You' : <PixelText text={message.sender.name} />}
          </span>
          <time className={styles.time} dateTime={message.createdAt}>
            {formatTime(message.createdAt, now)}
          </time>
        </div>
      )}
      {firstLink(content) && (
        <div className={isCurrentUser ? styles.metaOwn : styles.meta}>
          <LinkPreviewCard messageId={message.id} />
        </div>
      )}
      <Bubble>
        {picture && <MessagePicture picture={picture} />}
        {content && (
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
      {picture && onDrawOnIt && (
        <div className={isCurrentUser ? styles.metaOwn : styles.meta}>
          <ActionButton onClick={() => onDrawOnIt(picture)}>
            Draw on It
          </ActionButton>
        </div>
      )}
    </>
  );
}
