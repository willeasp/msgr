import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  chatAddedNotice,
  notificationTitle,
  parseAlertPreferences,
  serializeAlertPreferences,
  shouldAlert,
  type AlertPreferences,
} from '../../lib/alerts';
import { beep } from '../../lib/beep';
import type {
  ChatAddedReason,
  ChatKind,
} from '../../lib/__generated__/graphql';

const STORAGE_KEY = 'alerts';
const TITLE = document.title;

export interface ArrivedMessage {
  content: string;
  sender: { id: string; name: string };
  chat: { id: string; kind: ChatKind; title: string };
}

/** Whether this browser can show desktop notifications at all. */
export const notificationsSupported = 'Notification' in window;

/**
 * Gets the viewer's attention for messages they aren't looking at: a beep, a
 * desktop notification that opens the chat, and an unread count in the tab.
 */
export function useAlerts(viewerId: string | undefined, openChatId?: string) {
  const navigate = useNavigate();
  const [prefs, setPrefs] = useState(() =>
    parseAlertPreferences(localStorage.getItem(STORAGE_KEY))
  );
  const unread = useRef(0);

  const save = (next: AlertPreferences) => {
    localStorage.setItem(STORAGE_KEY, serializeAlertPreferences(next));
    setPrefs(next);
  };

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

  /** A beep, a count in the tab while it's hidden, and a notification that opens `chatId`. */
  const ring = useCallback(
    ({
      title,
      body,
      chatId,
    }: {
      title: string;
      body: string;
      chatId: string;
    }) => {
      if (document.visibilityState !== 'visible') {
        document.title = `(${++unread.current}) ${TITLE}`;
      }
      if (prefs.sound) beep();
      if (
        prefs.notify &&
        notificationsSupported &&
        Notification.permission === 'granted'
      ) {
        const notification = new Notification(title, { body, tag: chatId });
        notification.onclick = () => {
          window.focus();
          navigate(`/${chatId}`);
          notification.close();
        };
      }
    },
    [prefs, navigate]
  );

  const alert = useCallback(
    ({ content, sender, chat }: ArrivedMessage) => {
      const pageVisible = document.visibilityState === 'visible';
      if (
        shouldAlert(
          { senderId: sender.id, chatId: chat.id },
          { viewerId, openChatId, pageVisible }
        )
      ) {
        ring({
          title: notificationTitle(sender.name, chat),
          body: content,
          chatId: chat.id,
        });
      }
    },
    [ring, viewerId, openChatId]
  );

  /** Always worth telling: someone joined with your invite, or added you somewhere. */
  const alertChatAdded = useCallback(
    (event: {
      reason: ChatAddedReason;
      by: { name: string };
      chat: { id: string; title: string };
    }) => ring({ ...chatAddedNotice(event), chatId: event.chat.id }),
    [ring]
  );

  /**
   * Turning notifications on asks the browser first. Resolves to `false` if
   * the browser refuses, so the caller can explain where to allow them.
   */
  const setNotify = async (notify: boolean): Promise<boolean> => {
    if (notify && notificationsSupported) {
      const permission =
        Notification.permission === 'default'
          ? await Notification.requestPermission()
          : Notification.permission;
      if (permission !== 'granted') return false;
    }
    save({ ...prefs, notify });
    return true;
  };

  const setSound = (sound: boolean) => {
    save({ ...prefs, sound });
    if (sound) beep();
  };

  return { prefs, alert, alertChatAdded, setNotify, setSound };
}
