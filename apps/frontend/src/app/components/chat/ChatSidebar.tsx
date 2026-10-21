import { useQuery } from '@apollo/client/react';
import { gql } from '../../../lib/__generated__';
import Button from '../../../sacred/components/Button';
import { LoadingState } from '../LoadingState';
import { MacWindow } from '../MacWindow';
import { Muted } from '../Muted';
import { ChatListItem } from './ChatListItem';
import styles from './ChatSidebar.module.css';

export const GET_CHATS = gql(`
  query GetChats {
    chats {
      id
      kind
      title
      counterpart {
        id
        name
        avatar {
          width
          height
          bits
        }
      }
      participants {
        id
        name
      }
      messages(limit: 1) {
        id
        content
        movie {
          frames
        }
        sound {
          frames
        }
        createdAt
      }
    }
  }
`);

interface ChatSidebarProps {
  selectedChatId: string | undefined;
  onNewChat: () => void;
}

export function ChatSidebar({ selectedChatId, onNewChat }: ChatSidebarProps) {
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
