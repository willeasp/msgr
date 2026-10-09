import { useMutation, useQuery } from '@apollo/client/react';
import { gql } from '../../lib/__generated__';
import { ChatKind } from '../../lib/__generated__/graphql';
import { useParams, useNavigate } from 'react-router-dom';
import SidebarLayout from '../../sacred/components/SidebarLayout';
import { useModals } from '../../sacred/components/page/ModalContext';
import { useHotkeys } from '../../sacred/modules/hotkeys';
import { ME } from '../auth/protected-route';
import { AppNavigation } from '../components/AppNavigation';
import { ChatSidebar, GET_CHATS } from '../components/chat/ChatSidebar';
import { ChatWindow, GET_CHAT_DATA } from '../components/chat/ChatWindow';
import { JoinChannelDialog } from '../components/chat/JoinChannelDialog';
import { EmptyChatState } from '../components/chat/EmptyChatState';
import { NewChatModal } from '../components/chat/NewChatModal';
import { NotificationsBlockedDialog } from '../components/NotificationsBlockedDialog';
import { notificationsSupported, useAlerts } from '../hooks/use-alerts';
import { useChatFeed } from '../hooks/use-chat-feed';
import { useMediaQuery } from '../hooks/use-media-query';
import styles from './chat.module.css';

// Below this the Chats window and the open chat take turns on the desktop.
const NARROW = '(max-width: 760px)';

const LEAVE_CHANNEL = gql(`
  mutation LeaveChannel($chatId: ID!) {
    leaveChannel(chatId: $chatId)
  }
`);

export function Chat() {
  // The route is the source of truth for the open chat: "/:chatId".
  const { chatId } = useParams<{ chatId: string }>();
  const navigate = useNavigate();
  const { data: meData } = useQuery(ME);
  const { open } = useModals();
  const isNarrow = useMediaQuery(NARROW);
  const alerts = useAlerts(meData?.me?.id, chatId);
  useChatFeed(alerts.alert);

  const { data: chatData } = useQuery(GET_CHAT_DATA, {
    variables: { chatId: chatId ?? '' },
    skip: !chatId,
  });
  const [leaveChannel] = useMutation(LEAVE_CHANNEL, {
    refetchQueries: [{ query: GET_CHATS }],
  });

  const startNewChat = () => open(NewChatModal, {});
  const joinChannel = () => open(JoinChannelDialog, {});
  const closeChat = () => navigate('/');
  const leaveOpenChannel =
    chatId && chatData?.chat?.kind === ChatKind.Channel
      ? async () => {
          await leaveChannel({ variables: { chatId } });
          navigate('/');
        }
      : undefined;
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
        alerts={{
          ...alerts.prefs,
          onToggleNotify: notificationsSupported
            ? async () => {
                const allowed = await alerts.setNotify(!alerts.prefs.notify);
                if (!allowed) open(NotificationsBlockedDialog, {});
              }
            : undefined,
          onToggleSound: () => alerts.setSound(!alerts.prefs.sound),
        }}
        onNewChat={startNewChat}
        onJoinChannel={joinChannel}
        onCloseChat={chatId ? closeChat : undefined}
        onLeaveChannel={leaveOpenChannel}
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
