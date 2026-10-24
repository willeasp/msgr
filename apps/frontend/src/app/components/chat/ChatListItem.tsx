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

interface ChatListItemProps {
  chat: {
    id: string;
    title: string;
    /** The other person, in a direct chat: the row shows their face. */
    counterpart?: Person | null;
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
          <RowEllipsis>
            <Muted>
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
            </Muted>
          </RowEllipsis>
        </Indent>
      </Avatar>
    </Link>
  );
});
