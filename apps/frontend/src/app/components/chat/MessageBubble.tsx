import { memo } from 'react';
import ActionButton from '../../../sacred/components/ActionButton';
import Message from '../../../sacred/components/Message';
import MessageViewer from '../../../sacred/components/MessageViewer';
import { isOnlyEmoji } from '../../../lib/emoji';
import { firstLink, splitLinks } from '../../../lib/links';
import type { KeptMovie } from '../../../lib/movie-wire';
import type { KeptPicture } from '../../../lib/picture-wire';
import type { KeptSound } from '../../../lib/sound-wire';
import { Ago } from '../Ago';
import { Face, type Person } from '../Face';
import { PixelText } from '../PixelText';
import { MessageMovie } from './MessageMovie';
import { MessagePicture } from './MessagePicture';
import { MessageSound } from './MessageSound';
import { LinkPreviewCard } from './LinkPreviewCard';
import { useLongPress } from '../../hooks/use-long-press';
import styles from './MessageBubble.module.css';

interface MessageBubbleProps {
  message: {
    id: string;
    content?: string | null;
    picture?: KeptPicture | null;
    movie?: KeptMovie | null;
    sound?: KeptSound | null;
    sender: Person & { name: string };
    createdAt: string;
  };
  isCurrentUser: boolean;
  /** The first of a run from one sender: it shows the time, and their face if it's someone else's. */
  showMeta: boolean;
  /** Name the sender above the run: in groups and channels, not direct chats. */
  showName: boolean;
  /** Opens the paint window on a picture; offered under each one. */
  onDrawOnIt?: (picture: KeptPicture) => void;
  /** Opens the paint window over a movie; offered under each one. */
  onDrawOnMovie?: (movie: KeptMovie) => void;
  /** Opens Get Info on the message: a click on the bubble, or a finger held on it. */
  onGetInfo?: (messageId: string) => void;
}

/**
 * The viewer's own messages sit right in the accent colour, others' left.
 * Drawn again only when its own props change, not whenever the history does.
 */
export const MessageBubble = memo(function MessageBubble({
  message,
  isCurrentUser,
  showMeta,
  showName,
  onDrawOnIt,
  onDrawOnMovie,
  onGetInfo,
}: MessageBubbleProps) {
  const Bubble = isCurrentUser ? MessageViewer : Message;
  const { picture, movie, sound } = message;
  const content = message.content ?? '';
  // A click, or a finger held on it, opens Get Info; a tap doesn't, so
  // scrolling past a message never opens a dialog.
  const getInfo = useLongPress({
    onClick: (e) => {
      // A link opens itself, a sound's controls play it, and dragging over
      // the words selects them.
      if ((e.target as Element).closest('a, button, [data-own-clicks]')) {
        return;
      }
      if (window.getSelection()?.toString()) return;
      onGetInfo?.(message.id);
    },
    onHold: () => onGetInfo?.(message.id),
  });

  return (
    <div
      className={`${isCurrentUser ? styles.own : styles.theirs} ${
        showMeta ? styles.first : ''
      }`}
    >
      {/* Theirs lead with the sender's face, follow-ups keeping its place so
          a run lines up; the viewer's own need none, and keep to the right. */}
      {!isCurrentUser && (
        <div className={styles.face}>
          {showMeta && <Face person={message.sender} />}
        </div>
      )}
      <div className={styles.body}>
        {showMeta && showName && !isCurrentUser && (
          <span className={styles.sender}>
            <PixelText text={message.sender.name} />
          </span>
        )}
        {firstLink(content) && <LinkPreviewCard messageId={message.id} />}
        <div className={styles.line}>
          <div
            className={styles.pick}
            data-pressable={onGetInfo ? true : undefined}
            data-pressed={getInfo.pressed || undefined}
            {...(onGetInfo ? getInfo.handlers : {})}
          >
            <Bubble>
              {picture && <MessagePicture picture={picture} />}
              {movie && <MessageMovie movie={movie} />}
              {sound && <MessageSound sound={sound} />}
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
          </div>
          {showMeta && <Ago className={styles.time} date={message.createdAt} />}
        </div>
        {/* Under the bubble, not in it: the viewer's bubbles are inverted. */}
        {((picture && onDrawOnIt) || (movie && onDrawOnMovie)) && (
          <div className={styles.under}>
            {picture && onDrawOnIt && (
              <ActionButton onClick={() => onDrawOnIt(picture)}>
                Draw on It
              </ActionButton>
            )}
            {movie && onDrawOnMovie && (
              <ActionButton onClick={() => onDrawOnMovie(movie)}>
                Draw on It
              </ActionButton>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
