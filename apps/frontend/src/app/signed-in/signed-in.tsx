import { useQuery } from '@apollo/client/react';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { GetMeQuery } from '../../lib/__generated__/graphql';
import { shouldOffer } from '../../lib/push';
import { useModals } from '../../sacred/components/page/ModalContext';
import { LoadingState } from '../components/LoadingState';
import type { MenuItem } from '../components/MenuBar';
import { NotificationsBlockedDialog } from '../components/NotificationsBlockedDialog';
import { NotificationsDialog } from '../components/NotificationsDialog';
import { useAlerts } from '../hooks/use-alerts';
import { useChatFeed } from '../hooks/use-chat-feed';
import { useInstallPrompt } from '../hooks/use-install-prompt';
import {
  dismissOffer,
  offerDismissed,
  setup,
  useNotifications,
} from '../hooks/use-notifications';
import { useOpenChatFromNotifications } from '../hooks/use-service-worker';
import { useTypists, type Typists } from '../hooks/use-typing';
import { useWatching } from '../hooks/use-watching';
import { ME } from './me';

type Viewer = NonNullable<GetMeQuery['me']>;

/** What every signed-in view shares, kept by `SignedIn` whatever's on screen. */
export interface SignedInValue {
  readonly viewer: Viewer;
  readonly isAdmin: boolean;
  readonly typists: Typists;
  readonly alertSound: { readonly on: boolean; toggle(): void };
  /** Special → Notifications, where this browser can have them. */
  readonly notifications?: MenuItem;
  /** Present while the browser offers to install Msgr. */
  readonly install?: () => Promise<void>;
  /** Which chat a window shows; only `useChatOnScreen` sets it. */
  readonly showChat: React.Dispatch<React.SetStateAction<string | null>>;
}

const SignedInContext = createContext<SignedInValue | null>(null);

/** What every signed-in view shares. Only views under `SignedIn` may ask. */
export function useSignedIn(): SignedInValue {
  const value = useContext(SignedInContext);
  if (!value) throw new Error('useSignedIn is only for routes under SignedIn');
  return value;
}

/**
 * Says this chat is on screen while the calling component is mounted, so its
 * messages neither beep nor notify. The chat window calls it, so a view that
 * shows no chat watches none.
 */
export function useChatOnScreen(chatId: string) {
  const { showChat } = useSignedIn();
  useEffect(() => {
    showChat(chatId);
    return () => showChat((shown) => (shown === chatId ? null : shown));
  }, [chatId, showChat]);
}

/**
 * The layout of every signed-in route: it sends anyone signed out to /login,
 * and holds what must last as long as someone is signed in, whatever view is
 * on screen: the live feed, alerts, typing, the notifications offer and the
 * notifications' links. A view under it only draws itself, so it can't stop
 * any of them.
 */
export function SignedIn() {
  const { data, loading, error } = useQuery(ME);
  const location = useLocation();

  if (loading) return <LoadingState label="Connecting" fill />;
  if (error || !data?.me) {
    // Back here after signing in.
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <Live viewer={data.me} isAdmin={!!data.admin} />;
}

function Live({ viewer, isAdmin }: { viewer: Viewer; isAdmin: boolean }) {
  const { open } = useModals();
  const [chatOnScreen, showChat] = useState<string | null>(null);
  const alerts = useAlerts(viewer.id, chatOnScreen ?? undefined);
  useWatching(chatOnScreen ?? undefined);
  useOpenChatFromNotifications();
  const install = useInstallPrompt();
  const notifications = useNotifications();

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

  return (
    <SignedInContext.Provider
      value={{
        viewer,
        isAdmin,
        typists,
        alertSound: {
          on: alerts.prefs.sound,
          toggle: () => alerts.setSound(!alerts.prefs.sound),
        },
        notifications: notificationsItem,
        install,
        showChat,
      }}
    >
      <Outlet />
    </SignedInContext.Provider>
  );
}
