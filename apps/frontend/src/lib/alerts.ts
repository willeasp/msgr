import { ChatKind } from './__generated__/graphql';

/** How Msgr gets your attention when a message arrives. */
export interface AlertPreferences {
  /** Desktop notifications; the browser must allow them too. */
  notify: boolean;
  sound: boolean;
}

const DEFAULTS: AlertPreferences = { notify: false, sound: true };

/** Someone else's message, in a chat you aren't looking at right now. */
export function shouldAlert(
  message: { senderId: string; chatId: string },
  viewer: {
    viewerId: string | undefined;
    openChatId: string | undefined;
    pageVisible: boolean;
  }
): boolean {
  if (message.senderId === viewer.viewerId) return false;
  return !viewer.pageVisible || message.chatId !== viewer.openChatId;
}

/** "Bob", or "Bob in #general" when it wasn't a direct chat. */
export function notificationTitle(
  sender: string,
  chat: { kind: ChatKind; title: string }
): string {
  return chat.kind === ChatKind.Direct ? sender : `${sender} in ${chat.title}`;
}

export function serializeAlertPreferences(prefs: AlertPreferences): string {
  return JSON.stringify(prefs);
}

export function parseAlertPreferences(stored: string | null): AlertPreferences {
  try {
    const { notify, sound } = JSON.parse(stored ?? 'null') ?? {};
    if (typeof notify === 'boolean' && typeof sound === 'boolean') {
      return { notify, sound };
    }
  } catch {
    // Unreadable: use the defaults.
  }
  return DEFAULTS;
}
