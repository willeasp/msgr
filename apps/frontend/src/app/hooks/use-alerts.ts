import { useCallback, useEffect, useRef, useState } from 'react';
import {
  parseAlertPreferences,
  serializeAlertPreferences,
  shouldAlert,
} from '../../lib/alerts';
import { audio } from '../audio';

const STORAGE_KEY = 'alerts';
const TITLE = document.title;

export interface ArrivedMessage {
  sender: { id: string };
  chat: { id: string };
}

/**
 * Gets the viewer's attention while Msgr is open, for messages they aren't
 * looking at: a beep, and an unread count in the tab. Notifications come by
 * push (`useNotifications`), open or not.
 */
export function useAlerts(viewerId: string | undefined, openChatId?: string) {
  const [prefs, setPrefs] = useState(() =>
    parseAlertPreferences(localStorage.getItem(STORAGE_KEY))
  );
  const unread = useRef(0);

  // Seen again: clear the count in the tab title.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      unread.current = 0;
      document.title = TITLE;
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  /** A beep, and a count in the tab while it's hidden. */
  const ring = useCallback(() => {
    if (document.visibilityState !== 'visible') {
      document.title = `(${++unread.current}) ${TITLE}`;
    }
    if (prefs.sound) audio.beep();
  }, [prefs]);

  const alert = useCallback(
    ({ sender, chat }: ArrivedMessage) => {
      const pageVisible = document.visibilityState === 'visible';
      if (
        shouldAlert(
          { senderId: sender.id, chatId: chat.id },
          { viewerId, openChatId, pageVisible }
        )
      ) {
        ring();
      }
    },
    [ring, viewerId, openChatId]
  );

  const setSound = (sound: boolean) => {
    const next = { ...prefs, sound };
    localStorage.setItem(STORAGE_KEY, serializeAlertPreferences(next));
    setPrefs(next);
    if (sound) audio.beep();
  };

  /** Always worth a beep: someone joined with your invite, or added you somewhere. */
  return { prefs, alert, alertChatAdded: ring, setSound };
}
