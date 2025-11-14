import { useEffect, useRef } from 'react';
import { useQuery, useSubscription } from '@apollo/client/react';
import { gql } from '../../../lib/__generated__';
import { MessageBubble } from './MessageBubble';

const GET_CHAT_MESSAGES = gql(`
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
          const isDuplicate = existing.messages.some(m => m.id === newMessage.id);
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
      <div className="flex-1 overflow-y-auto p-5 bg-gray-100 text-center text-gray-600">
        Loading messages...
      </div>
    );
  }

  if (!messagesData?.messages || messagesData.messages.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto p-5 bg-gray-100">
        <div className="text-center text-gray-600 mt-10">
          No messages yet. Start the conversation!
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-5 bg-gray-100">
      {messagesData.messages.map((message) => {
        const isCurrentUser = message.sender.id === currentUserId;

        return (
          <MessageBubble
            key={message.id}
            message={message}
            isCurrentUser={isCurrentUser}
          />
        );
      })}
      <div ref={messagesEndRef} />
    </div>
  );
}
