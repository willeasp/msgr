import { useState } from 'react';
import { useQuery, useMutation } from '@apollo/client/react';
import { gql } from '../../../lib/__generated__';
import { UserSearchResult } from './UserSearchResult';

const SEARCH_USERS = gql(`
  query SearchUsers($query: String!) {
    users(query: $query) {
      id
      name
      email
    }
  }
`);

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

const FIND_OR_CREATE_CHAT = gql(`
  mutation FindOrCreateChat($participantId: ID!) {
    findOrCreateChat(participantId: $participantId) {
      id
      title
      participants {
        id
        name
      }
    }
  }
`);

interface NewChatModalProps {
  show: boolean;
  onClose: () => void;
  onChatCreated: (chatId: string) => void;
}

export function NewChatModal({ show, onClose, onChatCreated }: NewChatModalProps) {
  const [userSearchQuery, setUserSearchQuery] = useState('');

  const { data: searchData } = useQuery(SEARCH_USERS, {
    variables: { query: userSearchQuery },
    skip: !userSearchQuery || userSearchQuery.length < 2,
  });

  const [findOrCreateChat] = useMutation(FIND_OR_CREATE_CHAT, {
    refetchQueries: [{ query: GET_CHATS }],
    onCompleted: (data) => {
      onChatCreated(data.findOrCreateChat.id);
      setUserSearchQuery('');
    },
  });

  const handleStartChat = (userId: string) => {
    findOrCreateChat({ variables: { participantId: userId } });
  };

  const handleClose = () => {
    setUserSearchQuery('');
    onClose();
  };

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]"
      onClick={handleClose}
    >
      <div
        className="bg-white rounded-lg p-6 w-[90%] max-w-[500px] max-h-[80vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="m-0 mb-5 text-[22px]">Start New Chat</h2>
        <input
          type="text"
          value={userSearchQuery}
          onChange={(e) => setUserSearchQuery(e.target.value)}
          placeholder="Search users by name or email..."
          autoFocus
          className="w-full p-3 text-[15px] border border-gray-300 rounded mb-4 box-border"
        />
        {userSearchQuery.length >= 2 && (
          <div>
            {searchData?.users && searchData.users.length > 0 ? (
              <div>
                {searchData.users.map((user) => (
                  <UserSearchResult
                    key={user.id}
                    user={user}
                    onSelect={() => handleStartChat(user.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="p-5 text-center text-gray-600">
                No users found
              </div>
            )}
          </div>
        )}
        {userSearchQuery.length < 2 && (
          <div className="p-5 text-center text-gray-600">
            Type at least 2 characters to search
          </div>
        )}
      </div>
    </div>
  );
}
