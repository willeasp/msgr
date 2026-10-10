import { describe, expect, it } from 'vitest';
import {
  ChatId,
  type ChannelName,
  type Chat,
  type ChatAdded,
} from './chat.js';
import type { Drawing } from './drawing.js';
import { invalidInput } from './errors.js';
import { MessageId, type Message, type MessageContent } from './message.js';
import {
  chatAddedNotification,
  messageNotification,
  PushSubscription,
} from './push.js';
import { err } from './result.js';
import { UserId, type Email, type User } from './user.js';

const KEYS = { p256dh: 'B'.repeat(87), auth: 'A'.repeat(22) };
const FCM = 'https://fcm.googleapis.com/fcm/send/abc:def';
const parse = (endpoint: string, keys = KEYS) =>
  PushSubscription.parse({ endpoint, ...keys });

describe('PushSubscription.parse', () => {
  it.each([
    FCM,
    'https://updates.push.services.mozilla.com/wpush/v2/gAAAAABk',
    'https://web.push.apple.com/QGhZTn1Rbz-0bA',
    'https://wns2-bl2p.notify.windows.com/w/?token=BQYAAAB',
  ])('accepts a browser push service: %s', (endpoint) => {
    expect(parse(endpoint)).toEqual({
      ok: true,
      value: { endpoint, ...KEYS },
    });
  });

  it.each([
    'http://fcm.googleapis.com/fcm/send/abc',
    'https://fcm.googleapis.com:8443/fcm/send/abc',
    'https://user@fcm.googleapis.com/fcm/send/abc',
    'https://fcm.googleapis.com.evil.example/fcm/send/abc',
    'https://notify.windows.com/w/',
    'https://127.0.0.1/',
    'https://[::1]/',
    'https://localhost/',
    'https://169.254.169.254/latest/meta-data',
    'not a url',
    `https://fcm.googleapis.com/${'a'.repeat(2048)}`,
  ])(
    'refuses anything else, so Msgr only ever calls push services: %s',
    (endpoint) => {
      expect(parse(endpoint)).toEqual(
        err(invalidInput('endpoint', 'Not a push service'))
      );
    }
  );

  it('refuses keys that are not the right length of base64url', () => {
    const field = (keys: typeof KEYS) => {
      const parsed = parse(FCM, keys);
      return parsed.ok ? null : parsed.error.field;
    };
    expect(field({ ...KEYS, p256dh: 'B'.repeat(86) })).toBe('p256dh');
    expect(field({ ...KEYS, p256dh: '+'.repeat(87) })).toBe('p256dh');
    expect(field({ ...KEYS, auth: 'A'.repeat(24) })).toBe('auth');
    expect(field({ ...KEYS, auth: `${'A'.repeat(21)}=` })).toBe('auth');
  });
});

const bob: User = {
  id: UserId('bob'),
  email: 'bob@example.com' as Email,
  name: 'Bob',
};
const ada = UserId('ada');
const direct: Chat = {
  kind: 'direct',
  id: ChatId('d'),
  participantIds: [ada, bob.id],
};
const team: Chat = {
  kind: 'group',
  id: ChatId('g'),
  title: 'Team',
  participantIds: [ada, bob.id],
};
const general: Chat = {
  kind: 'channel',
  id: ChatId('c'),
  name: 'general' as ChannelName,
  participantIds: [ada, bob.id],
};
const text = (content: string, chat: Chat = direct): Message => ({
  kind: 'text',
  id: MessageId('m'),
  chatId: chat.id,
  senderId: bob.id,
  content: content as MessageContent,
  createdAt: new Date(0),
});

describe('messageNotification', () => {
  it('names the sender, and where they said it unless it was a direct chat', () => {
    expect(messageNotification(text('hi'), bob, direct)).toEqual({
      title: 'Bob',
      body: 'hi',
      chatId: direct.id,
    });
    expect(messageNotification(text('hi', team), bob, team).title).toBe(
      'Bob in Team'
    );
    expect(messageNotification(text('hi', general), bob, general).title).toBe(
      'Bob in #general'
    );
  });

  it('says a drawing was sent', () => {
    const drawing: Message = {
      kind: 'drawing',
      id: MessageId('m'),
      chatId: direct.id,
      senderId: bob.id,
      drawing: 'AAAA' as Drawing,
      createdAt: new Date(0),
    };
    expect(messageNotification(drawing, bob, direct).body).toBe(
      'Sent a drawing.'
    );
  });

  it('cuts long text to 200 characters without splitting an emoji', () => {
    expect(messageNotification(text('a'.repeat(200)), bob, direct).body).toBe(
      'a'.repeat(200)
    );
    const { body } = messageNotification(text('😀'.repeat(250)), bob, direct);
    expect([...body]).toHaveLength(200);
    expect(body).toBe(`${'😀'.repeat(199)}…`);
  });
});

describe('chatAddedNotification', () => {
  it('says who joined with your invite, or who added you where', () => {
    const joined: ChatAdded = {
      chat: direct,
      by: bob.id,
      reason: 'invite-accepted',
    };
    const added: ChatAdded = {
      chat: general,
      by: bob.id,
      reason: 'added-to-channel',
    };

    expect(chatAddedNotification(joined, bob)).toEqual({
      title: 'Bob joined Msgr',
      body: 'They used your invite. Say hello!',
      chatId: direct.id,
    });
    expect(chatAddedNotification(added, bob)).toEqual({
      title: 'Bob added you to #general',
      body: 'It’s in your Chats now.',
      chatId: general.id,
    });
  });
});
