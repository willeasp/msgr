import { useQuery, useSubscription } from '@apollo/client/react';
import { gql } from '../../../lib/__generated__';
import { withReceivedMessage } from '../../../lib/chat-list';
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
      title
      participants {
        id
        name
      }
      messages(limit: 1) {
        id
        content
        createdAt
      }
    }
  }
`);

// Selects a whole chat-list row, so a chat the list hasn't seen can join it.
const MESSAGE_RECEIVED_SUBSCRIPTION = gql(`
  subscription OnMessageReceivedForSidebar {
    messageReceived {
      id
      content
      createdAt
      chat {
        id
        title
        participants {
          id
          name
        }
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

  useSubscription(MESSAGE_RECEIVED_SUBSCRIPTION, {
    onData: ({ data, client }) => {
      const message = data.data?.messageReceived;
      if (!message) return;
      client.cache.updateQuery({ query: GET_CHATS }, (existing) =>
        existing
          ? { chats: withReceivedMessage(existing.chats, message) }
          : existing
      );
    },
  });

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
