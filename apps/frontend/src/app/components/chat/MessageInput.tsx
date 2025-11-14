import { useState, useRef, useEffect } from 'react';
import { useMutation } from '@apollo/client/react';
import { gql } from '../../../lib/__generated__';

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

const SEND_MESSAGE = gql(`
  mutation SendMessage($chatId: ID!, $content: String!) {
    sendMessage(input: { chatId: $chatId, content: $content }) {
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

interface MessageInputProps {
  chatId: string;
}

export function MessageInput({ chatId }: MessageInputProps) {
  const [messageInput, setMessageInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const [sendMessage, { loading: sendingMessage }] = useMutation(SEND_MESSAGE, {
    onCompleted: () => {
      setMessageInput('');
    },
    update: (cache, { data }) => {
      if (!data?.sendMessage) return;

      // Update cache with the new message
      cache.updateQuery(
        {
          query: GET_CHAT_MESSAGES,
          variables: { chatId },
        },
        (existing) => {
          if (!existing?.messages) return existing;

          // Avoid duplicates (subscription might have already added it)
          const isDuplicate = existing.messages.some(
            (m) => m.id === data.sendMessage.id
          );
          if (isDuplicate) return existing;

          return {
            messages: [...existing.messages, data.sendMessage],
          };
        }
      );
    },
  });

  useEffect(() => {
    if (!sendingMessage) {
      inputRef.current?.focus();
    }
  }, [sendingMessage]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() || sendingMessage) return;

    try {
      await sendMessage({
        variables: {
          chatId,
          content: messageInput,
        },
      });
    } finally {
      inputRef.current?.focus();
    }
  };

  return (
    <form
      onSubmit={handleSendMessage}
      className="p-4 border-t border-gray-200 bg-white flex gap-3"
    >
      <input
        ref={inputRef}
        type="text"
        value={messageInput}
        onChange={(e) => setMessageInput(e.target.value)}
        placeholder="Type a message..."
        disabled={sendingMessage}
        className="flex-1 p-3 text-[15px] border border-gray-300 rounded-full outline-none disabled:opacity-50 disabled:cursor-not-allowed"
      />
      <button
        type="submit"
        disabled={!messageInput.trim() || sendingMessage}
        className="px-6 py-3 text-[15px] bg-blue-600 text-white border-none rounded-full cursor-pointer font-bold hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed disabled:hover:bg-gray-300"
      >
        {sendingMessage ? 'Sending...' : 'Send'}
      </button>
    </form>
  );
}
