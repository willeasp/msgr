import { useEffect, useRef } from 'react';
import { useQuery, useSubscription } from '@apollo/client/react';
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
      sender {
        id
        name
      }
      createdAt
    }
  }
`);

const MESSAGE_RECEIVED_SUBSCRIPTION = gql(`
  subscription OnMessageReceived {
    messageReceived {
      id
      content
      sender {
        id
        name
      }
      chat {
        id
      }
      createdAt
    }
  }
`);

interface MessageListProps {
  chatId: string;
  currentUserId: string | undefined;
}

export function MessageList({ chatId, currentUserId }: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: messagesData, loading: messagesLoading } = useQuery(
    GET_CHAT_MESSAGES,
    {
      variables: { chatId },
    }
  );

  // Subscribe to new messages
  useSubscription(MESSAGE_RECEIVED_SUBSCRIPTION, {
    onData: ({ data, client }) => {
      const newMessage = data.data?.messageReceived;
      if (!newMessage || newMessage.chat.id !== chatId) return;

      // Update cache with new message
      client.cache.updateQuery(
        {
          query: GET_CHAT_MESSAGES,
          variables: { chatId },
        },
        (existing) => {
          if (!existing?.messages) return existing;

          // Avoid duplicates
          const isDuplicate = existing.messages.some(
            (m) => m.id === newMessage.id
          );
          if (isDuplicate) return existing;

          return {
            messages: [...existing.messages, newMessage],
          };
        }
      );
    },
  });

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messagesData?.messages]);

  if (messagesLoading) {
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
        />
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
}
