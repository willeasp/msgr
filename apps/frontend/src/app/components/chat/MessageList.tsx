import { useEffect, useRef } from 'react';
import { useQuery } from '@apollo/client/react';
import { gql } from '../../../lib/__generated__';
import { LoadingState } from '../LoadingState';
import { Muted } from '../Muted';
import { MessageBubble } from './MessageBubble';
import styles from './MessageList.module.css';

export const GET_CHAT_MESSAGES = gql(`
  query GetChatMessages($chatId: ID!) {
    messages(chatId: $chatId, limit: 50) {
      id
      content
      drawing
      sender {
        id
        name
      }
      createdAt
    }
  }
`);

interface MessageListProps {
  chatId: string;
  currentUserId: string | undefined;
  onDrawOnIt?: (drawing: string) => void;
}

export function MessageList({
  chatId,
  currentUserId,
  onDrawOnIt,
}: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // The page's feed appends live messages; opening the chat also refreshes
  // it, catching anything sent while this tab was offline or asleep.
  const { data: messagesData, loading: messagesLoading } = useQuery(
    GET_CHAT_MESSAGES,
    {
      variables: { chatId },
      fetchPolicy: 'cache-and-network',
    }
  );

  // Open on the latest message; glide only to ones that arrive after.
  const hasScrolled = useRef(false);
  useEffect(() => {
    if (!messagesEndRef.current) return;
    messagesEndRef.current.scrollIntoView({
      behavior: hasScrolled.current ? 'smooth' : 'instant',
    });
    hasScrolled.current = true;
  }, [messagesData?.messages]);

  if (messagesLoading && !messagesData) {
    return (
      <div className={styles.root}>
        <LoadingState label="Loading messages" />
      </div>
    );
  }

  const messages = messagesData?.messages ?? [];

  if (messages.length === 0) {
    return (
      <div className={styles.root}>
        <div className={styles.empty}>
          <Muted>No messages yet. Say hello.</Muted>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.root} role="log" aria-label="Messages">
      {messages.map((message, index) => (
        <MessageBubble
          key={message.id}
          message={message}
          isCurrentUser={message.sender.id === currentUserId}
          showMeta={messages[index - 1]?.sender.id !== message.sender.id}
          onDrawOnIt={onDrawOnIt}
        />
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
}
