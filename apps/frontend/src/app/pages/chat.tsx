import { useEffect, useRef } from 'react';
import { useMutation, useQuery } from '@apollo/client/react';
import { gql } from '../../lib/__generated__';
import { ChatKind } from '../../lib/__generated__/graphql';
import { shouldOffer } from '../../lib/push';
import { useParams, useNavigate } from 'react-router-dom';
import SidebarLayout from '../../sacred/components/SidebarLayout';
import { useModals } from '../../sacred/components/page/ModalContext';
import { useHotkeys } from '../../sacred/modules/hotkeys';
import { ME } from '../auth/protected-route';
import { AppNavigation } from '../components/AppNavigation';
import { ChatSidebar, GET_CHATS } from '../components/chat/ChatSidebar';
import { AddPeopleDialog } from '../components/chat/AddPeopleDialog';
import { ChatWindow, GET_CHAT_DATA } from '../components/chat/ChatWindow';
import { InviteDialog } from '../components/InviteDialog';
import { ProfileDialog } from '../components/ProfileDialog';
import { JoinChannelDialog } from '../components/chat/JoinChannelDialog';
import { EmptyChatState } from '../components/chat/EmptyChatState';
import { GetInfoDialog } from '../components/chat/GetInfoDialog';
import { NewChatModal } from '../components/chat/NewChatModal';
import { NotificationsBlockedDialog } from '../components/NotificationsBlockedDialog';
import { NotificationsDialog } from '../components/NotificationsDialog';
import { useAlerts } from '../hooks/use-alerts';
import { useChatFeed } from '../hooks/use-chat-feed';
import { useMediaQuery } from '../hooks/use-media-query';
import { useInstallPrompt } from '../hooks/use-install-prompt';
import {
  dismissOffer,
  offerDismissed,
  setup,
  useNotifications,
} from '../hooks/use-notifications';
import { useOpenChatFromNotifications } from '../hooks/use-service-worker';
import { useTypists } from '../hooks/use-typing';
import { useWatching } from '../hooks/use-watching';
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
  useOpenChatFromNotifications();
  const install = useInstallPrompt();
  const notifications = useNotifications();
  useWatching(chatId);

  const turnOnNotifications = async () => {
    const outcome = await notifications.turnOn();
    // A browser that can't subscribe isn't asked again on every visit.
    if (outcome === 'failed') dismissOffer();
    if (outcome !== 'on') open(NotificationsBlockedDialog, { reason: outcome });
  };
  const notificationsItem = !notifications.pushKey
    ? undefined
    : setup === 'push'
    ? {
        label: 'Notifications',
        checked: notifications.subscribed === true,
        onClick: () =>
          void (notifications.subscribed
            ? notifications.turnOff()
            : turnOnNotifications()),
      }
    : setup === 'install-first'
    ? {
        label: 'Notifications…',
        onClick: () =>
          open(NotificationsDialog, {
            setup: 'install-first' as const,
            onTurnOn: turnOnNotifications,
          }),
      }
    : undefined;

  // Offered once the browser has said whether it's subscribed and the push
  // key is in; `offered` keeps it to once per visit.
  const offered = useRef(false);
  useEffect(() => {
    if (offered.current || notifications.subscribed === null) return;
    if (setup === 'unsupported') return;
    const offer = shouldOffer({
      setup,
      pushKey: notifications.pushKey,
      permission: 'Notification' in window ? Notification.permission : null,
      subscribed: notifications.subscribed,
      dismissed: offerDismissed(),
    });
    if (!offer) return;
    offered.current = true;
    open(NotificationsDialog, { setup, onTurnOn: turnOnNotifications });
  });
  const typists = useTypists();
  useChatFeed({
    onMessage: (message) => {
      // Their message is what they were typing.
      typists.stopped(message.chat.id, message.sender.id);
      alerts.alert(message);
    },
    onChatAdded: alerts.alertChatAdded,
    onTyping: typists.started,
  });

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
  const joinChannel = () => open(JoinChannelDialog, {});
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
        alerts={{
          sound: alerts.prefs.sound,
          onToggleSound: () => alerts.setSound(!alerts.prefs.sound),
        }}
        notifications={notificationsItem}
        onNewChat={startNewChat}
        onNewChannel={newChannel}
        onJoinChannel={joinChannel}
        onInvite={invite}
        onProfile={() => open(ProfileDialog, {})}
        onAddPeople={addPeople}
        onCloseChat={chatId ? closeChat : undefined}
        onLeaveChannel={leaveOpenChannel}
        onInstall={install}
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
