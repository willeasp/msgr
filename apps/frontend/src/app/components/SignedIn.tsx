import { useQuery } from '@apollo/client/react';
import { useEffect, useRef, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { sessionOf } from '../../lib/connection';
import { shouldOffer } from '../../lib/push';
import { useModals } from '../../sacred/components/page/ModalContext';
import { ME } from '../data/me';
import { useAlerts } from '../hooks/use-alerts';
import { useChatFeed } from '../hooks/use-chat-feed';
import { useInstallPrompt } from '../hooks/use-install-prompt';
import { useMediaRetry } from '../hooks/use-media';
import {
  dismissOffer,
  offerDismissed,
  setup,
  useNotifications,
} from '../hooks/use-notifications';
import { useOpenChatFromNotifications } from '../hooks/use-service-worker';
import { SignedInContext, type Viewer } from '../hooks/use-signed-in';
import { useTypists } from '../hooks/use-typing';
import { useWatching } from '../hooks/use-watching';
import { Connecting } from './Connecting';
import {
  NotificationsBlockedDialog,
  NotificationsDialog,
  prefetchDialogs,
} from './dialogs';

/**
 * The layout of every signed-in route: it sends anyone signed out to /login,
 * and holds what must last as long as someone is signed in, whatever view is
 * on screen: the live feed, alerts, typing, the notifications offer and the
 * notifications' links. A view under it only draws itself, so it can't stop
 * any of them.
 * Who that is comes from `sessionOf` (lib/connection.ts).
 */
export function SignedIn() {
  const { data, previousData, error, refetch } = useQuery(ME);
  const location = useLocation();
  const session = sessionOf(data ?? previousData, error !== undefined);

  switch (session.kind) {
    case 'in':
      return <Live viewer={session.viewer} isAdmin={session.isAdmin} />;
    case 'out':
      // Back here after signing in.
      return <Navigate to="/login" replace state={{ from: location }} />;
    case 'waiting':
      return (
        <Connecting failed={session.failed} onRetry={() => void refetch()} />
      );
  }
}

function Live({ viewer, isAdmin }: { viewer: Viewer; isAdmin: boolean }) {
  const { open } = useModals();
  const [chatOnScreen, showChat] = useState<string | null>(null);
  const alerts = useAlerts(viewer.id, chatOnScreen ?? undefined);
  useWatching(chatOnScreen ?? undefined);
  useOpenChatFromNotifications();
  useMediaRetry();
  // The dialogs, while nothing else is going on: they're first opened from here.
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((then) => setTimeout(then, 1));
    const cancel = window.cancelIdleCallback ?? clearTimeout;
    const id = idle(prefetchDialogs);
    return () => cancel(id);
  }, []);
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
