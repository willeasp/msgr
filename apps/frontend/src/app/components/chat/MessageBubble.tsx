import { memo } from 'react';
import ActionButton from '../../../sacred/components/ActionButton';
import Message from '../../../sacred/components/Message';
import MessageViewer from '../../../sacred/components/MessageViewer';
import { isOnlyEmoji } from '../../../lib/emoji';
import { firstLink, splitLinks } from '../../../lib/links';
import { formatClock } from '../../../lib/time';
import type { KeptMovie } from '../../../lib/movie-wire';
import type { KeptPicture } from '../../../lib/picture-wire';
import type { KeptSound } from '../../../lib/sound-wire';
import Button from '../../../sacred/components/Button';
import { Face, type Person } from '../Face';
import { PixelText } from '../PixelText';
import { Wristwatch } from '../Wristwatch';
import { MessageMovie } from './MessageMovie';
import { MessagePicture } from './MessagePicture';
import { MessageSound } from './MessageSound';
import { LinkPreviewCard } from './LinkPreviewCard';
import { useModals } from '../../../sacred/components/page/ModalContext';
import { useLongPress } from '../../hooks/use-long-press';
import { PictureWindow } from '../dialogs';
import type { Shown } from './PictureWindow';
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
  /** The first of a run (lib/runs.ts): it shows the time, and their face if it's someone else's. */
  showMeta: boolean;
  /** Name the sender above the run: in groups and channels, not direct chats. */
  showName: boolean;
  /** Opens the paint window on a picture; offered under each one. */
  onDrawOnIt?: (picture: KeptPicture) => void;
  /** Opens the paint window over a movie; offered under each one. */
  onDrawOnMovie?: (movie: KeptMovie) => void;
  /** Opens Get Info on the message: a click on the bubble, or a finger held on it. */
  onGetInfo?: (messageId: string) => void;
  /** One the viewer sent from here that the server hasn't stored: on its way, or not sent (and why, if it said). */
  outgoing?:
    | { readonly state: 'sending' }
    | {
        readonly state: 'notSent';
        readonly problem: string | null;
        readonly onTryAgain: () => void;
      };
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
  outgoing,
}: MessageBubbleProps) {
  const Bubble = isCurrentUser ? MessageViewer : Message;
  const { picture, movie, sound } = message;
  const content = message.content ?? '';
  const { open } = useModals();
  // A picture or movie opens full screen, in a window of its own.
  const shown: Shown | null = picture
    ? { kind: 'picture', picture }
    : movie
    ? { kind: 'movie', movie }
    : null;
  const showFull = () => {
    if (!shown) return;
    const what = shown.kind === 'picture' ? 'Picture' : 'Movie';
    open(PictureWindow, {
      title: isCurrentUser
        ? `Your ${what}`
        : `${message.sender.name}’s ${what}`,
      shown,
    });
  };
  const onMedia = (e: React.MouseEvent) =>
    (e.target as Element).closest('[data-full-screen]') !== null;
  // A click, or a finger held on it, opens Get Info; a tap doesn't, so
  // scrolling past a message never opens a dialog. A click or a tap on a
  // picture or movie opens it full screen; a finger held there, Get Info.
  const getInfo = useLongPress({
    onClick: (e) => {
      if (onMedia(e)) return showFull();
      // A link opens itself, a sound's controls play it, and dragging over
      // the words selects them.
      if ((e.target as Element).closest('a, button, [data-own-clicks]')) {
        return;
      }
      if (window.getSelection()?.toString()) return;
      onGetInfo?.(message.id);
    },
    onHold: () => onGetInfo?.(message.id),
    onTap: (e) => {
      if (onMedia(e)) showFull();
    },
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
        {/* Once stored: the server previews only what it has. */}
        {firstLink(content) && !outgoing && (
          <LinkPreviewCard messageId={message.id} />
        )}
        {/* What the history keeps in place while the viewer reads it
            (MessageList): the words, whatever comes and goes above them. */}
        <div className={styles.line} data-message>
          <div
            className={styles.pick}
            data-pressable={onGetInfo ? true : undefined}
            data-pressed={getInfo.pressed || undefined}
            {...(onGetInfo || shown ? getInfo.handlers : {})}
          >
            <Bubble>
              {shown && (
                <div
                  role="button"
                  tabIndex={0}
                  aria-label={
                    shown.kind === 'picture'
                      ? 'Show Picture Full Screen'
                      : 'Show Movie Full Screen'
                  }
                  className={styles.media}
                  data-full-screen
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' && e.key !== ' ') return;
                    e.preventDefault();
                    showFull();
                  }}
                >
                  {picture && <MessagePicture picture={picture} />}
                  {movie && <MessageMovie movie={movie} />}
                </div>
              )}
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
          {outgoing?.state === 'sending' ? (
            // The wristwatch where its time goes, until the server has it.
            <span className={styles.sending} role="img" aria-label="Sending">
              <Wristwatch />
            </span>
          ) : (
            showMeta &&
            !outgoing && (
              // The time of day: the day's name heads the history above it.
              <time className={styles.time} dateTime={message.createdAt}>
                {formatClock(message.createdAt)}
              </time>
            )
          )}
        </div>
        {/* Read out as it comes, in the log's polite part, as its message was. */}
        {outgoing?.state === 'notSent' && (
          <div className={styles.notSent}>
            <span>
              Not Sent.{outgoing.problem ? ` ${outgoing.problem}` : ''}
            </span>
            <Button theme="SECONDARY" onClick={outgoing.onTryAgain}>
              Try Again
            </Button>
          </div>
        )}
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
