import { describe, expect, it } from 'vitest';
import {
  notificationTitle,
  parseAlertPreferences,
  serializeAlertPreferences,
  shouldAlert,
} from './alerts';
import { ChatKind } from './__generated__/graphql';

const message = { senderId: 'bob', chatId: 'general' };

describe('shouldAlert', () => {
  it('stays quiet about your own messages', () => {
    expect(
      shouldAlert(message, {
        viewerId: 'bob',
        openChatId: undefined,
        pageVisible: false,
      })
    ).toBe(false);
  });

  it("stays quiet when you're looking at that chat", () => {
    expect(
      shouldAlert(message, {
        viewerId: 'ada',
        openChatId: 'general',
        pageVisible: true,
      })
    ).toBe(false);
  });

  it('alerts for another chat, or for any chat while the page is hidden', () => {
    const viewer = { viewerId: 'ada', openChatId: 'general' };
    expect(
      shouldAlert(
        { ...message, chatId: 'books' },
        { ...viewer, pageVisible: true }
      )
    ).toBe(true);
    expect(shouldAlert(message, { ...viewer, pageVisible: false })).toBe(true);
  });
});

describe('notificationTitle', () => {
  it('names the sender, and where they said it unless it was a direct chat', () => {
    expect(
      notificationTitle('Bob', { kind: ChatKind.Direct, title: 'Bob' })
    ).toBe('Bob');
    expect(
      notificationTitle('Bob', { kind: ChatKind.Channel, title: '#general' })
    ).toBe('Bob in #general');
    expect(
      notificationTitle('Bob', { kind: ChatKind.Group, title: 'Team' })
    ).toBe('Bob in Team');
  });
});

describe('alert preferences', () => {
  it('beeps but does not notify until asked to', () => {
    expect(parseAlertPreferences(null)).toEqual({ notify: false, sound: true });
  });

  it('round-trips, and ignores anything unreadable', () => {
    const prefs = { notify: true, sound: false };
    expect(parseAlertPreferences(serializeAlertPreferences(prefs))).toEqual(
      prefs
    );
    expect(parseAlertPreferences('{"notify":"yes"}')).toEqual({
      notify: false,
      sound: true,
    });
    expect(parseAlertPreferences('nope')).toEqual({
      notify: false,
      sound: true,
    });
  });
});
