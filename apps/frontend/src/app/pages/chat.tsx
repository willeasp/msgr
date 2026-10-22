import { useMutation, useQuery } from '@apollo/client/react';
import { gql } from '../../lib/__generated__';
import { ChatKind } from '../../lib/__generated__/graphql';
import { useParams, useNavigate } from 'react-router-dom';
import SidebarLayout from '../../sacred/components/SidebarLayout';
import { useModals } from '../../sacred/components/page/ModalContext';
import { AppNavigation } from '../components/AppNavigation';
import { ChatSidebar } from '../components/chat/ChatSidebar';
import { AddPeopleDialog } from '../components/chat/AddPeopleDialog';
import { ChatWindow } from '../components/chat/ChatWindow';
import { GET_CHAT_DATA, GET_CHATS } from '../data/chats';
import { InviteDialog } from '../components/InviteDialog';
import { JoinChannelDialog } from '../components/chat/JoinChannelDialog';
import { EmptyChatState } from '../components/chat/EmptyChatState';
import { GetInfoDialog } from '../components/chat/GetInfoDialog';
import { NewChatModal } from '../components/chat/NewChatModal';
import { useMediaQuery } from '../hooks/use-media-query';
import { useSignedIn } from '../hooks/use-signed-in';
import styles from './chat.module.css';

// Below this the Chats window and the open chat take turns on the desktop.
const NARROW = '(max-width: 760px)';

const LEAVE_CHANNEL = gql(`
  mutation LeaveChannel($chatId: ID!) {
    leaveChannel(chatId: $chatId)
  }
`);

/** The desktop: the Chats window, and the chat the route opens. */
export function Chat() {
  // The route is the source of truth for the open chat: "/:chatId".
  const { chatId } = useParams<{ chatId: string }>();
  const navigate = useNavigate();
  const { viewer, typists } = useSignedIn();
  const { open } = useModals();
  const isNarrow = useMediaQuery(NARROW);

  const getInfo = (messageId: string) => open(GetInfoDialog, { messageId });

  const { data: chatData } = useQuery(GET_CHAT_DATA, {
    variables: { chatId: chatId ?? '' },
    skip: !chatId,
  });
  const [leaveChannel] = useMutation(LEAVE_CHANNEL, {
    refetchQueries: [{ query: GET_CHATS }],
  });

  const startNewChat = () => open(NewChatModal, {});
  const newChannel = () => open(JoinChannelDialog, { mode: 'new' as const });
  const invite = () => open(InviteDialog, {});
  const isChannel = chatData?.chat?.kind === ChatKind.Channel;
  const addPeople =
    chatId && isChannel ? () => open(AddPeopleDialog, { chatId }) : undefined;
  const closeChat = () => navigate('/');
  const leaveOpenChannel =
    chatId && isChannel
      ? async () => {
          await leaveChannel({ variables: { chatId } });
          navigate('/');
        }
      : undefined;
  const chats = (
    <ChatSidebar selectedChatId={chatId} onNewChat={startNewChat} />
  );

  const conversation = chatId ? (
    <ChatWindow
      key={chatId}
      chatId={chatId}
      currentUserId={viewer.id}
      onClose={closeChat}
      onAddPeople={addPeople}
      typists={typists}
      onGetInfo={getInfo}
    />
  ) : (
    <EmptyChatState
      onNewChat={startNewChat}
      onNewChannel={newChannel}
      onInvite={invite}
    />
  );

  return (
    <div className={styles.screen}>
      <AppNavigation
        onAddPeople={addPeople}
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
