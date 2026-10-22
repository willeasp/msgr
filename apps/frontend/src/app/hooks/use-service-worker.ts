import { useEffect, useSyncExternalStore } from 'react';
import { NavigateFunction, useNavigate, useParams } from 'react-router-dom';
import {
  onServiceWorkerMessage,
  restartToUpdate,
  updateReady,
} from '../browser/service-worker';

// Puts the list underneath the chat, so going back (a phone's edge swipe) shows it.
function openOverList(navigate: NavigateFunction, chatId: string) {
  navigate('/', { replace: true });
  navigate(`/${chatId}`);
}

/** A notification was clicked: go to its chat, with the list one step back. */
export function useOpenChatFromNotifications() {
  const navigate = useNavigate();
  const { chatId } = useParams<{ chatId: string }>();

  // A notification that opened Msgr lands on its chat with no history behind it.
  useEffect(() => {
    if (chatId && window.history.state?.idx === 0)
      openOverList(navigate, chatId);
  }, []);

  useEffect(
    () =>
      onServiceWorkerMessage((data) => {
        const message = data as { type?: string; chatId?: string } | null;
        if (message?.type === 'open-chat' && message.chatId)
          openOverList(navigate, message.chatId);
      }),
    [navigate]
  );
}

/** Restarts into a newer Msgr, once one is installed; undefined until then. */
export function useRestartToUpdate(): (() => void) | undefined {
  const ready = useSyncExternalStore(updateReady.subscribe, updateReady.get);
  return ready ? restartToUpdate : undefined;
}
