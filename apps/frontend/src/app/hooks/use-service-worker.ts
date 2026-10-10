import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/** Installs /sw.js, which shows notifications and opens their chats. */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js').catch(() => undefined);
}

/** A notification was clicked while Msgr was open: go to its chat. */
export function useOpenChatFromNotifications() {
  const navigate = useNavigate();
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'open-chat') navigate(`/${event.data.chatId}`);
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () =>
      navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [navigate]);
}
