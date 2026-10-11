import { formatTime } from '../../../lib/utils/time';
import { useClock } from '../../hooks/use-clock';
import ActionButton from '../../../sacred/components/ActionButton';
import Message from '../../../sacred/components/Message';
import MessageViewer from '../../../sacred/components/MessageViewer';
import { isOnlyEmoji } from '../../../lib/emoji';
import { firstLink, splitLinks } from '../../../lib/links';
import type { WirePicture } from '../../../lib/picture-wire';
import { Face, type Person } from '../Face';
import { PixelText } from '../PixelText';
import { MessagePicture } from './MessagePicture';
import { LinkPreviewCard } from './LinkPreviewCard';
import styles from './MessageBubble.module.css';

interface MessageBubbleProps {
  message: {
    id: string;
    content?: string | null;
    picture?: WirePicture | null;
    sender: Person & { name: string };
    createdAt: string;
  };
  isCurrentUser: boolean;
  /** The first of a run from one sender: it shows their face and the time. */
  showMeta: boolean;
  /** Name the sender above the run: in groups and channels, not direct chats. */
  showName: boolean;
  /** Opens the paint window on a picture; offered under each one. */
  onDrawOnIt?: (picture: WirePicture) => void;
}

/** The viewer's own messages sit right in the accent colour, others' left. */
export function MessageBubble({
  message,
  isCurrentUser,
  showMeta,
  showName,
  onDrawOnIt,
}: MessageBubbleProps) {
  const Bubble = isCurrentUser ? MessageViewer : Message;
  const now = useClock();
  const { picture } = message;
  const content = message.content ?? '';

  return (
    <div
      className={`${isCurrentUser ? styles.own : styles.theirs} ${
        showMeta ? styles.first : ''
      }`}
    >
      {/* Follow-ups keep the face's place, so a run lines up. */}
      <div className={styles.face}>
        {showMeta && <Face person={message.sender} />}
      </div>
      <div className={styles.body}>
        {showMeta && showName && !isCurrentUser && (
          <span className={styles.sender}>
            <PixelText text={message.sender.name} />
          </span>
        )}
        {firstLink(content) && <LinkPreviewCard messageId={message.id} />}
        <div className={styles.line}>
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
          {showMeta && (
            <time className={styles.time} dateTime={message.createdAt}>
              {formatTime(message.createdAt, now)}
            </time>
          )}
        </div>
        {/* Under the bubble, not in it: the viewer's bubbles are inverted. */}
        {picture && onDrawOnIt && (
          <div className={styles.under}>
            <ActionButton onClick={() => onDrawOnIt(picture)}>
              Draw on It
            </ActionButton>
          </div>
        )}
      </div>
    </div>
  );
}
