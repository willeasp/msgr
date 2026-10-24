import { useQuery } from '@apollo/client/react';
import { GET_CHATS } from '../../data/chats';
import Button from '../../../sacred/components/Button';
import { LoadingState } from '../LoadingState';
import { MacWindow, TitleBarButton } from '../MacWindow';
import { Menu } from '../MenuBar';
import { Muted } from '../Muted';
import { ChatListItem } from './ChatListItem';
import styles from './ChatSidebar.module.css';

interface ChatSidebarProps {
  selectedChatId: string | undefined;
  onNewChat: () => void;
  onNewChannel: () => void;
  onJoinChannel: () => void;
}

export function ChatSidebar({
  selectedChatId,
  onNewChat,
  onNewChannel,
  onJoinChannel,
}: ChatSidebarProps) {
  const { data: chatsData, loading: chatsLoading } = useQuery(GET_CHATS);

  const chats = chatsData?.chats ?? [];

  return (
    <MacWindow
      title="Chats"
      info={
        <span>
          {chatsLoading
            ? 'Loading…'
            : `${chats.length} ${chats.length === 1 ? 'chat' : 'chats'}`}
        </span>
      }
      // On a phone, starting something is in reach, not only in File.
      action={
        <Menu
          title="New"
          button={<TitleBarButton aria-haspopup="menu">New…</TitleBarButton>}
          items={[
            { label: 'New Chat…', onClick: onNewChat },
            { label: 'New Channel…', onClick: onNewChannel },
            { label: 'Join Channel…', onClick: onJoinChannel },
          ]}
        />
      }
      fill
    >
      <nav className={styles.list} aria-label="Chats">
        {chatsLoading ? (
          <LoadingState label="Loading chats" />
        ) : chats.length > 0 ? (
          chats.map((chat) => (
            <ChatListItem
              key={chat.id}
              chat={chat}
              isSelected={chat.id === selectedChatId}
            />
          ))
        ) : (
          <div className={styles.empty}>
            <Muted>No chats yet.</Muted>
            <br />
            <br />
            <Button theme="SECONDARY" onClick={onNewChat}>
              New Chat…
            </Button>
          </div>
        )}
      </nav>
    </MacWindow>
  );
}
