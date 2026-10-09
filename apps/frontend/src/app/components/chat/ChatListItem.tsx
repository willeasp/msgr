import { Link } from 'react-router-dom';
import { identicon } from '../../../lib/pixels';
import { formatTime } from '../../../lib/utils/time';
import Avatar from '../../../sacred/components/Avatar';
import Indent from '../../../sacred/components/Indent';
import RowEllipsis from '../../../sacred/components/RowEllipsis';
import RowSpaceBetween from '../../../sacred/components/RowSpaceBetween';
import { Muted } from '../Muted';
import styles from './ChatListItem.module.css';

interface ChatListItemProps {
  chat: {
    id: string;
    title: string;
    messages: Array<{
      id: string;
      content: string;
      createdAt: string;
    }>;
  };
  isSelected: boolean;
}

export function ChatListItem({ chat, isSelected }: ChatListItemProps) {
  const latestMessage = chat.messages[0];

  return (
    <Link
      to={`/${chat.id}`}
      className={isSelected ? `${styles.item} ${styles.selected}` : styles.item}
      aria-current={isSelected ? 'page' : undefined}
    >
      <Avatar src={identicon(chat.id)}>
        <Indent>
          <RowSpaceBetween>
            <RowEllipsis>
              <span className={styles.title}>{chat.title}</span>
            </RowEllipsis>
            {latestMessage && (
              <time className={styles.time} dateTime={latestMessage.createdAt}>
                {formatTime(latestMessage.createdAt)}
              </time>
            )}
          </RowSpaceBetween>
          <RowEllipsis>
            <Muted>{latestMessage?.content ?? 'No messages yet'}</Muted>
          </RowEllipsis>
        </Indent>
      </Avatar>
    </Link>
  );
}
