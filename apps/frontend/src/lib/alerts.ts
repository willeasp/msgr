/** How Msgr gets your attention while it's open. Notifications come by push. */
export interface AlertPreferences {
  sound: boolean;
}

const DEFAULTS: AlertPreferences = { sound: true };

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

export function serializeAlertPreferences(prefs: AlertPreferences): string {
  return JSON.stringify(prefs);
}

export function parseAlertPreferences(stored: string | null): AlertPreferences {
  try {
    const { sound } = JSON.parse(stored ?? 'null') ?? {};
    if (typeof sound === 'boolean') return { sound };
  } catch {
    // Unreadable: use the defaults.
  }
  return DEFAULTS;
}
