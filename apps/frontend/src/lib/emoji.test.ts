import { describe, expect, it } from 'vitest';
import { EMOJI_ART } from './emoji-art';
import {
  SIZE,
  drawnEmoji,
  isBlankBitmap,
  isOnlyEmoji,
  pixelEmoji,
  splitEmoji,
  type Sample,
} from './emoji';

describe('splitEmoji', () => {
  it('leaves text without emoji as one run', () => {
    expect(splitEmoji('plain text')).toEqual([{ text: 'plain text' }]);
  });
  it('cuts out each emoji', () => {
    expect(splitEmoji('Ship it 🚀!')).toEqual([
      { text: 'Ship it ' },
      { emoji: '🚀' },
      { text: '!' },
    ]);
  });
  it('keeps families, flags, skin tones and keycaps whole', () => {
    for (const emoji of ['👨‍👩‍👧', '🇸🇪', '👍🏽', '1️⃣', '❤️']) {
      expect(splitEmoji(emoji)).toEqual([{ emoji }]);
    }
  });
  it('leaves symbols that are text by default as text', () => {
    expect(splitEmoji('© 2026 ™ ❤')).toEqual([{ text: '© 2026 ™ ❤' }]);
  });
});

describe('isOnlyEmoji', () => {
  it('holds for one to three emoji, spaces allowed', () => {
    for (const text of ['🎉', '😂 👍', '🔥🔥🔥'])
      expect(isOnlyEmoji(text)).toBe(true);
  });
  it('fails for four, for any text, and for nothing', () => {
    for (const text of ['🔥🔥🔥🔥', 'ok 👍', '', '  '])
      expect(isOnlyEmoji(text)).toBe(false);
  });
});

const samples = (at: (x: number, y: number) => Sample): Sample[] =>
  Array.from({ length: SIZE * SIZE }, (_, i) =>
    at(i % SIZE, Math.floor(i / SIZE))
  );
const clear: Sample = { alpha: 0, luminance: 1 };
const inDisc = (x: number, y: number) => (x - 7.5) ** 2 + (y - 7.5) ** 2 < 36;

describe('pixelEmoji', () => {
  it('draws nothing for nothing', () => {
    expect(isBlankBitmap(pixelEmoji(samples(() => clear)))).toBe(true);
  });
  it('keeps a black square solid', () => {
    const bitmap = pixelEmoji(
      samples((x, y) =>
        x >= 4 && x < 12 && y >= 4 && y < 12
          ? { alpha: 1, luminance: 0 }
          : clear
      )
    );
    expect(bitmap[4]).toBe('....########....');
    expect(bitmap[8]).toBe('....########....');
    expect(bitmap).toHaveLength(SIZE);
  });
  it('outlines a white disc, leaving its inside paper', () => {
    const bitmap = pixelEmoji(
      samples((x, y) => (inDisc(x, y) ? { alpha: 1, luminance: 1 } : clear))
    );
    expect(bitmap[8]?.[2]).toBe('#'); // the disc's left edge
    expect(bitmap[8]?.[8]).toBe('.'); // its middle
  });
  it('keeps a grey dot inside a white disc as an edge', () => {
    // 0.6 stretches to 0.67, which dithers to paper: only the edge can ink it.
    const bitmap = pixelEmoji(
      samples((x, y) =>
        !inDisc(x, y)
          ? clear
          : { alpha: 1, luminance: x === 7 && y === 7 ? 0.6 : 1 }
      )
    );
    expect(bitmap[7]?.[7]).toBe('#');
  });
});

describe('hand-drawn emoji', () => {
  it('are all 16×16', () => {
    for (const art of Object.values(EMOJI_ART)) {
      expect(art).toHaveLength(SIZE);
      for (const row of art) expect(row).toMatch(/^[#.]{16}$/);
    }
  });
  it('are found with or without the emoji variation selector', () => {
    expect(drawnEmoji('😀')).toBe(EMOJI_ART['😀']);
    expect(drawnEmoji('😀️')).toBe(EMOJI_ART['😀']);
    expect(drawnEmoji('🚀')).toBeUndefined();
  });
});
