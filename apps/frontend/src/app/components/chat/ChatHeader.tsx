import { useQuery } from '@apollo/client/react';
import { gql } from '../../../lib/__generated__';

interface ChatHeaderProps {
  chatId: string;
}

const GET_CHAT_DATA = gql(`
  query GetChatData($chatId: ID!) {
    chat(id: $chatId) {
      id
      title
      participants {
        id
        name
        email
      }
    }
  }
`);

export function ChatHeader({ chatId }: ChatHeaderProps) {
  const { data, loading } = useQuery(GET_CHAT_DATA, {
    variables: { chatId },
  });

  if (loading) return <div className="p-4 text-center text-gray-600">Loading...</div>;

  const chat = data?.chat;

  return (
    <div className="p-4 border-b border-gray-200 bg-white">
      <h3 className="m-0 text-lg text-gray-800">
        {chat?.title}
      </h3>
      <div className="text-xs text-gray-500 mt-1">
        {chat?.participants?.length} participant
        {chat?.participants?.length || 0 > 1 ? 's' : ''}
      </div>
    </div>
  );
}
