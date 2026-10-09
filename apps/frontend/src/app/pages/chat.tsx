import { useQuery } from '@apollo/client/react';
import { useParams, useNavigate } from 'react-router-dom';
import SidebarLayout from '../../sacred/components/SidebarLayout';
import { useModals } from '../../sacred/components/page/ModalContext';
import { useHotkeys } from '../../sacred/modules/hotkeys';
import { ME } from '../auth/protected-route';
import { AppNavigation } from '../components/AppNavigation';
import { ChatSidebar } from '../components/chat/ChatSidebar';
import { ChatWindow } from '../components/chat/ChatWindow';
import { EmptyChatState } from '../components/chat/EmptyChatState';
import { NewChatModal } from '../components/chat/NewChatModal';
import { useMediaQuery } from '../hooks/use-media-query';
import styles from './chat.module.css';

// Below this the Chats window and the open chat take turns on the desktop.
const NARROW = '(max-width: 760px)';

export function Chat() {
  // The route is the source of truth for the open chat: "/:chatId".
  const { chatId } = useParams<{ chatId: string }>();
  const navigate = useNavigate();
  const { data: meData } = useQuery(ME);
  const { open } = useModals();
  const isNarrow = useMediaQuery(NARROW);

  const startNewChat = () => open(NewChatModal, {});
  const closeChat = () => navigate('/');
  useHotkeys('ctrl+k', startNewChat, {
    enableOnFormTags: true,
    preventDefault: true,
  });

  const chats = (
    <ChatSidebar selectedChatId={chatId} onNewChat={startNewChat} />
  );

  const conversation = chatId ? (
    <ChatWindow
      key={chatId}
      chatId={chatId}
      currentUserId={meData?.me?.id}
      onClose={closeChat}
    />
  ) : (
    <EmptyChatState onNewChat={startNewChat} />
  );

  return (
    <div className={styles.screen}>
      <AppNavigation
        onNewChat={startNewChat}
        onCloseChat={chatId ? closeChat : undefined}
      />
      <main className={styles.desktop}>
        {isNarrow ? (
          chatId ? (
            conversation
          ) : (
            chats
          )
        ) : (
          <SidebarLayout
            defaultSidebarWidth={32}
            isShowingHandle
            sidebar={chats}
            style={{ height: '100%', alignItems: 'stretch' }}
          >
            {conversation}
          </SidebarLayout>
        )}
      </main>
    </div>
  );
}

export default Chat;
