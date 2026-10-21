import { describe, expect, it } from 'vitest';
import {
  chatPlace,
  messageKind,
  messageName,
  messageSize,
  readers,
} from './info';

const picture = { width: 256, height: 160 };
const movie = { width: 320, height: 180, frames: 48 };
// 2.5 seconds: frames overlap by half, so 126 of them play 125 × 20 ms.
const sound = { frames: 126 };

describe('messageName', () => {
  it("quotes the text's first line, cut short", () => {
    expect(messageName({ content: 'Lunch?\nAt noon' })).toBe('“Lunch?”');
    expect(messageName({ content: 'x'.repeat(40) })).toBe(
      `“${'x'.repeat(31)}…”`
    );
  });

  it('names a picture or a movie alone', () => {
    expect(messageName({ content: null, picture })).toBe('Picture');
    expect(messageName({ content: null, movie })).toBe('Movie');
    expect(messageName({ content: null, sound })).toBe('Sound');
  });
});

describe('messageKind', () => {
  it('says what the message holds', () => {
    expect(messageKind({ content: 'hi' })).toBe('Text');
    expect(messageKind({ content: null, picture })).toBe('Picture');
    expect(messageKind({ content: null, movie })).toBe('Movie');
    expect(messageKind({ content: 'look', picture })).toBe(
      'Text with a picture'
    );
    expect(messageKind({ content: 'look', movie })).toBe('Text with a movie');
    expect(messageKind({ content: null, sound })).toBe('Sound');
    expect(messageKind({ content: 'listen', sound })).toBe('Text with a sound');
  });
});

describe('messageSize', () => {
  it('counts characters, emoji as one each', () => {
    expect(messageSize({ content: 'hi 👋' })).toBe('4 characters');
    expect(messageSize({ content: 'a' })).toBe('1 character');
  });

  it("gives a picture's pixels and a movie's frames and running time", () => {
    expect(messageSize({ content: 'look', picture })).toBe(
      '4 characters; 256 × 160 pixels'
    );
    expect(messageSize({ movie })).toBe(
      '320 × 180 pixels, 48 frames, 6 seconds'
    );
    expect(messageSize({ movie: { ...movie, frames: 12 } })).toBe(
      '320 × 180 pixels, 12 frames, 1.5 seconds'
    );
    expect(messageSize({ movie: { ...movie, frames: 1 } })).toBe(
      '320 × 180 pixels, 1 frame'
    );
  });

  it('gives how long a sound runs', () => {
    expect(messageSize({ content: 'listen', sound })).toBe(
      '6 characters; 2.5 seconds'
    );
    expect(messageSize({ sound: { frames: 3001 } })).toBe('60 seconds');
  });
});

describe('chatPlace', () => {
  it('names a direct chat after the other person', () => {
    expect(chatPlace({ kind: 'DIRECT', title: 'Ana' })).toBe(
      'Your chat with Ana'
    );
    expect(chatPlace({ kind: 'CHANNEL', title: '#general' })).toBe('#general');
    expect(chatPlace({ kind: 'GROUP', title: 'Team' })).toBe('Team');
  });
});

describe('readers', () => {
  const [ana, bo, cy, di] = ['ana', 'bo', 'cy', 'di'].map((id) => ({ id }));

  it('lists who has read it, first first, then who has yet to', () => {
    expect(
      readers({
        senderId: 'ana',
        participants: [ana, bo, cy, di],
        readBy: [
          { reader: di, at: '2026-10-21T15:00:00Z' },
          { reader: bo, at: '2026-10-21T15:05:00Z' },
        ],
      })
    ).toEqual([
      { person: di, at: '2026-10-21T15:00:00Z' },
      { person: bo, at: '2026-10-21T15:05:00Z' },
      { person: cy, at: null },
    ]);
  });

  it('keeps someone who read it and has since left', () => {
    expect(
      readers({
        senderId: 'ana',
        participants: [ana],
        readBy: [{ reader: bo, at: '2026-10-21T15:05:00Z' }],
      })
    ).toEqual([{ person: bo, at: '2026-10-21T15:05:00Z' }]);
  });
});
