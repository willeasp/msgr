import { memo } from 'react';
import { Link } from 'react-router-dom';
import { Ago } from '../Ago';
import Avatar from '../../../sacred/components/Avatar';
import Indent from '../../../sacred/components/Indent';
import RowEllipsis from '../../../sacred/components/RowEllipsis';
import RowSpaceBetween from '../../../sacred/components/RowSpaceBetween';
import { useFace, type Person } from '../Face';
import { Muted } from '../Muted';
import styles from './ChatListItem.module.css';
import { PixelText } from '../PixelText';
import { unreadLabel } from '../../../lib/chat-list';

interface ChatListItemProps {
  chat: {
    id: string;
    title: string;
    /** The other person, in a direct chat: the row shows their face. */
    counterpart?: Person | null;
    /** Others' messages the viewer hasn't read: the preview darkens and counts them. */
    unreadCount: number;
    messages: Array<{
      id: string;
      content?: string | null;
      movie?: { frames: number } | null;
      sound?: { frames: number } | null;
      createdAt: string;
    }>;
  };
  isSelected: boolean;
}

/** A chat in the list; drawn again only when its own props change. */
export const ChatListItem = memo(function ChatListItem({
  chat,
  isSelected,
}: ChatListItemProps) {
  const latestMessage = chat.messages[0];
  const face = useFace(chat.counterpart ?? { id: chat.id });
  const unread = chat.unreadCount;
  const preview = (
    <PixelText
      text={
        latestMessage
          ? latestMessage.content ??
            (latestMessage.movie
              ? 'Movie'
              : latestMessage.sound
              ? 'Sound'
              : 'Picture')
          : 'No messages yet'
      }
    />
  );

  return (
    <Link
      to={`/${chat.id}`}
      className={isSelected ? `${styles.item} ${styles.selected}` : styles.item}
      aria-current={isSelected ? 'page' : undefined}
    >
      <Avatar src={face.src} data-picture={face.picture || undefined}>
        <Indent>
          <RowSpaceBetween>
            <RowEllipsis>
              <span className={styles.title}>
                <PixelText text={chat.title} />
              </span>
            </RowEllipsis>
            {latestMessage && (
              <Ago className={styles.time} date={latestMessage.createdAt} />
            )}
          </RowSpaceBetween>
          <div className={styles.preview}>
            <RowEllipsis>
              {unread ? preview : <Muted>{preview}</Muted>}
            </RowEllipsis>
            {unread > 0 && (
              <span className={styles.unread}>
                {unreadLabel(unread)}
                <span className={styles.hidden}> unread</span>
              </span>
            )}
          </div>
        </Indent>
      </Avatar>
    </Link>
  );
});
