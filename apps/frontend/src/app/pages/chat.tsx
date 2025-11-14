import { useQuery } from '@apollo/client/react';
import { useParams, useNavigate } from 'react-router-dom';
import { gql } from '../../lib/__generated__';
import { ChatSidebar } from '../components/chat/ChatSidebar';
import { ChatHeader } from '../components/chat/ChatHeader';
import { MessageList } from '../components/chat/MessageList';
import { MessageInput } from '../components/chat/MessageInput';
import { EmptyChatState } from '../components/chat/EmptyChatState';

const GET_ME = gql(`
  query GetMeForChat {
    me {
      id
      name
      email
    }
  }
`);

export function Chat() {
  // Read chatId from the route: "/:chatId"
  const { chatId } = useParams<{ chatId: string }>();

  const navigate = useNavigate();

  const { data: meData } = useQuery(GET_ME);

  const selectedChatId = chatId ?? undefined;

  // Use router as source of truth. When a chat is selected in the sidebar,
  // update the URL to "/<id>" which will set selectedChatId via useParams.
  const handleSelectChat = (id: string) => {
    navigate(`/${id}`);
  };

  // Find the selected chat from the chats data
  return (
    <div className="flex h-screen font-sans">
      {/* Left Sidebar */}
      <ChatSidebar
        selectedChatId={selectedChatId}
        onSelectChat={handleSelectChat}
      />

      {/* Right Side - Chat Area */}
      <div className="flex-1 flex flex-col">
        {selectedChatId ? (
          <>
            <ChatHeader chatId={selectedChatId} />
            <MessageList
              chatId={selectedChatId}
              currentUserId={meData?.me?.id}
            />
            <MessageInput chatId={selectedChatId} />
          </>
        ) : (
          <EmptyChatState />
        )}
      </div>
    </div>
  );
}

export default Chat;
