import { Link } from 'react-router-dom';
import { identicon } from '../../../lib/pixels';
import { formatTime } from '../../../lib/utils/time';
import { useClock } from '../../hooks/use-clock';
import Avatar from '../../../sacred/components/Avatar';
import Indent from '../../../sacred/components/Indent';
import RowEllipsis from '../../../sacred/components/RowEllipsis';
import RowSpaceBetween from '../../../sacred/components/RowSpaceBetween';
import { Muted } from '../Muted';
import styles from './ChatListItem.module.css';
import { PixelText } from '../PixelText';

interface ChatListItemProps {
  chat: {
    id: string;
    title: string;
    messages: Array<{
      id: string;
      content?: string | null;
      createdAt: string;
    }>;
  };
  isSelected: boolean;
}

export function ChatListItem({ chat, isSelected }: ChatListItemProps) {
  const latestMessage = chat.messages[0];
  const now = useClock();

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
              <span className={styles.title}>
                <PixelText text={chat.title} />
              </span>
            </RowEllipsis>
            {latestMessage && (
              <time className={styles.time} dateTime={latestMessage.createdAt}>
                {formatTime(latestMessage.createdAt, now)}
              </time>
            )}
          </RowSpaceBetween>
          <RowEllipsis>
            <Muted>
              <PixelText
                text={
                  latestMessage
                    ? latestMessage.content ?? 'Picture'
                    : 'No messages yet'
                }
              />
            </Muted>
          </RowEllipsis>
        </Indent>
      </Avatar>
    </Link>
  );
}
