import { useQuery, useSubscription } from '@apollo/client/react';
import { gql } from '../../../lib/__generated__';
import { ChatListItem } from './ChatListItem';
import { SidebarHeader } from './SidebarHeader';

const GET_CHATS = gql(`
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

const MESSAGE_RECEIVED_SUBSCRIPTION = gql(`
  subscription OnMessageReceivedForSidebar {
    messageReceived {
      id
      content
      chat {
        id
      }
      createdAt
    }
  }
`);

interface ChatSidebarProps {
  selectedChatId: string | undefined;
  onSelectChat: (chatId: string) => void;
}

export function ChatSidebar({
  selectedChatId,
  onSelectChat,
}: ChatSidebarProps) {
  const { data: chatsData, loading: chatsLoading } = useQuery(GET_CHATS);

  // Subscribe to new messages to update chat previews in real-time
  useSubscription(MESSAGE_RECEIVED_SUBSCRIPTION, {
    onData: ({ data, client }) => {
      const newMessage = data.data?.messageReceived;
      if (!newMessage) return;

      // Update the GET_CHATS cache with the new message
      client.cache.updateQuery(
        { query: GET_CHATS },
        (existing) => {
          if (!existing?.chats) return existing;

          // Find the chat and update its latest message
          const updatedChats = existing.chats.map((chat) => {
            if (chat.id === newMessage.chat.id) {
              return {
                ...chat,
                messages: [newMessage], // Replace with latest message
              };
            }
            return chat;
          });

          return { chats: updatedChats };
        }
      );
    },
  });

  return (
    <div className="w-[30%] border-r border-gray-200 flex flex-col bg-gray-50">
      {/* Sidebar Header */}
      <SidebarHeader title="Chats" />

      {/* Chats List */}
      <div className="flex-1 overflow-y-auto">
        {chatsLoading ? (
          <div className="p-5 text-center text-gray-600">Loading chats...</div>
        ) : chatsData?.chats && chatsData.chats.length > 0 ? (
          chatsData.chats.map((chat) => {
            const isSelected = chat.id === selectedChatId;

            return (
              <ChatListItem
                key={chat.id}
                chat={chat}
                isSelected={isSelected}
                onSelect={() => onSelectChat(chat.id)}
              />
            );
          })
        ) : (
          <div className="p-10 text-center text-gray-600">
            <p>No chats yet</p>
            <p className="text-sm">Click "New Chat" to start a conversation</p>
          </div>
        )}
      </div>
    </div>
  );
}
