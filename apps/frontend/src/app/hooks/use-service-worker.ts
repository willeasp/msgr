import { useEffect, useRef } from 'react';
import { NavigateFunction, useNavigate, useParams } from 'react-router-dom';

/** Installs /sw.js, which shows notifications and opens their chats. */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js').catch(() => undefined);
}

// Puts the list underneath the chat, so going back (a phone's edge swipe) shows it.
function openOverList(navigate: NavigateFunction, chatId: string) {
  navigate('/', { replace: true });
  navigate(`/${chatId}`);
}

/** A notification was clicked: go to its chat, with the list one step back. */
export function useOpenChatFromNotifications() {
  const navigate = useNavigate();
  const { chatId } = useParams<{ chatId: string }>();

  // A notification that opened Msgr lands on its chat with no history behind
  // it. Only where the page arrived counts, not where it goes after.
  const arrival = useRef({ chatId, navigate });
  useEffect(() => {
    const { chatId, navigate } = arrival.current;
    if (chatId && window.history.state?.idx === 0)
      openOverList(navigate, chatId);
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'open-chat')
        openOverList(navigate, event.data.chatId);
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () =>
      navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [navigate]);
}
