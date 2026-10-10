import type { Brand } from './brand.js';
import type { Chat, ChatAdded, ChatId } from './chat.js';
import { invalidInput, type InvalidInput } from './errors.js';
import type { Message } from './message.js';
import { err, ok, type Result } from './result.js';
import type { User } from './user.js';

/**
 * Where one browser receives Web Push: an address at its vendor's push
 * service, and the keys to encrypt for it (from `PushSubscription.toJSON()`).
 */
export type PushSubscription = Brand<
  {
    readonly endpoint: string;
    readonly p256dh: string;
    readonly auth: string;
  },
  'PushSubscription'
>;

// Msgr POSTs to whatever an endpoint says, so only the browser vendors' push
// services will do: never an internal address.
const PUSH_SERVICES = new Set([
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'web.push.apple.com',
]);
const isPushService = (host: string) =>
  PUSH_SERVICES.has(host) || host.endsWith('.notify.windows.com');

const base64url = (length: number) => new RegExp(`^[A-Za-z0-9_-]{${length}}$`);
const P256DH = base64url(87); // a 65-byte P-256 public key
const AUTH = base64url(22); // a 16-byte secret

export const PushSubscription = {
  MAX_ENDPOINT_LENGTH: 2048,
  parse(raw: {
    readonly endpoint: string;
    readonly p256dh: string;
    readonly auth: string;
  }): Result<PushSubscription, InvalidInput> {
    let url: URL | null = null;
    try {
      url = new URL(raw.endpoint);
    } catch {
      // Not a URL at all.
    }
    if (
      !url ||
      url.protocol !== 'https:' ||
      url.port !== '' ||
      url.username !== '' ||
      url.password !== '' ||
      !isPushService(url.hostname) ||
      raw.endpoint.length > PushSubscription.MAX_ENDPOINT_LENGTH
    ) {
      return err(invalidInput('endpoint', 'Not a push service'));
    }
    if (!P256DH.test(raw.p256dh)) {
      return err(invalidInput('p256dh', 'Not a P-256 public key'));
    }
    if (!AUTH.test(raw.auth)) {
      return err(invalidInput('auth', 'Not a push auth secret'));
    }
    return ok({
      endpoint: raw.endpoint,
      p256dh: raw.p256dh,
      auth: raw.auth,
    } as PushSubscription);
  },
};

/** What a browser shows for a push, and the chat it opens. */
export interface Notification {
  readonly title: string;
  readonly body: string;
  readonly chatId: ChatId;
}

// Push payloads stop at about 4 KB, and a notification shows a few lines anyway.
const BODY_LENGTH = 200;

/** Whole code points, so an emoji is never cut in half. */
function cut(text: string): string {
  const characters = [...text];
  return characters.length <= BODY_LENGTH
    ? text
    : `${characters.slice(0, BODY_LENGTH - 1).join('')}…`;
}

/** "#general", a group's title, or for a direct chat, the other person. */
const titleOf = (chat: Chat, counterpart: User) =>
  chat.kind === 'channel'
    ? `#${chat.name}`
    : chat.kind === 'group'
    ? chat.title
    : counterpart.name;

/** "Bob", or "Bob in #general" when it wasn't a direct chat. */
export function messageNotification(
  message: Message,
  sender: User,
  chat: Chat
): Notification {
  return {
    title:
      chat.kind === 'direct'
        ? sender.name
        : `${sender.name} in ${titleOf(chat, sender)}`,
    body: message.kind === 'text' ? cut(message.content) : 'Sent a drawing.',
    chatId: chat.id,
  };
}

/** Someone joined with your invite, or added you to a channel. */
export function chatAddedNotification(
  { chat, reason }: ChatAdded,
  by: User
): Notification {
  return reason === 'invite-accepted'
    ? {
        title: `${by.name} joined Msgr`,
        body: 'They used your invite. Say hello!',
        chatId: chat.id,
      }
    : {
        title: `${by.name} added you to ${titleOf(chat, by)}`,
        body: 'It’s in your Chats now.',
        chatId: chat.id,
      };
}
