import { useState } from 'react';
import { useMutation } from '@apollo/client/react';
import { useNavigate } from 'react-router-dom';
import { gql } from '../../../lib/__generated__';
import { NewChatModal } from './NewChatModal';

const LOGOUT_MUTATION = gql(`
  mutation LogoutFromChat {
    logout
  }
`);

interface SidebarHeaderProps {
  title: string;
}

export function SidebarHeader({ title }: SidebarHeaderProps) {
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const navigate = useNavigate();
  const [logout] = useMutation(LOGOUT_MUTATION, {
    onCompleted: () => {
      localStorage.removeItem('authToken');
      navigate('/login');
    },
  });

  const onNewChat = () => {
    setShowNewChatModal(true);
  };

  const handleChatCreated = (chatId: string) => {
    navigate(`/${chatId}`);
  };

  return (
    <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-white">
      <h2 className="m-0 text-xl font-medium">Chats</h2>
      <div className="flex gap-2">
        <button
          onClick={onNewChat}
          className="px-4 py-2 text-sm bg-blue-500 text-white border-none rounded cursor-pointer hover:bg-blue-600"
        >
          New Chat
        </button>
        <button
          onClick={() => logout()}
          className="px-4 py-2 text-sm bg-red-500 text-white border-none rounded cursor-pointer hover:bg-red-600"
        >
          Logout
        </button>
      </div>

      {/* New Chat Modal */}
      <NewChatModal
        show={showNewChatModal}
        onClose={() => setShowNewChatModal(false)}
        onChatCreated={handleChatCreated}
      />
    </div>
  );
}
