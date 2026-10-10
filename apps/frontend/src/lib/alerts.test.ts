import { describe, expect, it } from 'vitest';
import {
  parseAlertPreferences,
  serializeAlertPreferences,
  shouldAlert,
} from './alerts';

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

// What notifications say is the server's now: apps/api/src/domain/push.ts.

describe('alert preferences', () => {
  it('beeps by default', () => {
    expect(parseAlertPreferences(null)).toEqual({ sound: true });
  });

  it('reads back what it saved', () => {
    expect(
      parseAlertPreferences(serializeAlertPreferences({ sound: false }))
    ).toEqual({ sound: false });
  });

  it('keeps the sound setting from before notifications moved to push', () => {
    expect(parseAlertPreferences('{"notify":true,"sound":false}')).toEqual({
      sound: false,
    });
  });

  it('falls back to the default for anything unreadable', () => {
    expect(parseAlertPreferences('{"sound":"yes"}')).toEqual({ sound: true });
    expect(parseAlertPreferences('nope')).toEqual({ sound: true });
  });
});
