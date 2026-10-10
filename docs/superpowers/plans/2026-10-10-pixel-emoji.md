# Pixel Emoji Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every emoji in message text, names and titles shows as 16×16 1-bit pixel art in the text's colour: dithered from the device's own emoji font, or hand-drawn where an override exists.

**Architecture:** Frontend only. `lib/emoji.ts` holds pure logic: finding emoji, the pixel pipeline from samples to a `Bitmap`, and the override lookup. `lib/emoji-art.ts` holds the hand-drawn overrides. A `PixelText` component samples each emoji once on a canvas, caches an SVG mask built with `pixelPath`, and renders masked spans that keep the real character, invisible, for copying and screen readers.

**Tech Stack:** TypeScript, React 19, `Intl.Segmenter`, canvas 2D, CSS masks, Vitest, Playwright.

**Spec:** [docs/superpowers/specs/2026-10-10-pixel-emoji-design.md](../specs/2026-10-10-pixel-emoji-design.md)

## Global Constraints

- Bitmaps are 16×16 `#`/`.` rows (`Bitmap` from `lib/pixels.ts`), drawn at 16 px in text and 32 px when a message is only emoji.
- Pipeline values, verbatim from the spec:
  - the sampling canvas is 96×96;
  - the font is `"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif` at 0.85 of the canvas;
  - the silhouette is alpha > 0.4;
  - contrast is `clamp((l − 0.2) / 0.6, 0, 1)`;
  - Atkinson passes 1/8 of the error to each of (x+1, y), (x+2, y), (x−1, y+1), (x, y+1), (x+1, y+1) and (x, y+2), with ink below 0.5;
  - a colour edge is a luminance difference above 0.3 with the right or lower neighbour, where off the grid counts as white (1).
- Emoji test: `/\p{Emoji_Presentation}|\p{Extended_Pictographic}️|⃣/u` on each grapheme. Only emoji means one to three emoji once whitespace is removed.
- The override lookup ignores U+FE0F on both sides.
- No new dependencies. No DOM in `lib/`. Vendored Sacred components are not edited.

## Review Focus

- **Text with no emoji, the common case, renders exactly as before:** the same string, with no extra spans. Test: `splitEmoji('plain')` is one text piece, and `PixelText` returns the string itself (Task 1 covers `splitEmoji`; `PixelText`'s early return is in Task 2).
- **An emoji the device can't draw shows as its character, never as a blank.** Test: `pixelEmoji` of all-transparent samples is blank, and `PixelText` treats a blank bitmap as "no mask" (Task 1 tests the blank; Task 2's `maskFor` returns null for blank).
- **The viewer's own inverted bubbles show emoji in paper colour, not as ink on ink.** Covered by `background: currentColor` with the character at `opacity: 0`, not `color: transparent`. The e2e checks the emoji element's background colour equals the bubble's text colour (Task 2).
- **Names that are only emoji, like a chat titled "🎉", don't break the window's accessible name.** `aria-label` stays the plain string, and the e2e finds chat windows by title as before (Task 2).
- **Copying a message gives the real emoji back.** The character stays in the DOM. The e2e asserts the bubble's text content contains "😀" (Task 2).

---

### Task 1: `lib/emoji.ts` and the hand-drawn overrides

**Files:**

- Create: `apps/frontend/src/lib/emoji.ts`, `apps/frontend/src/lib/emoji-art.ts`
- Test: `apps/frontend/src/lib/emoji.test.ts`

**Interfaces:**

- Produces:

```ts
export const SIZE = 16;
export type Piece = { readonly text: string } | { readonly emoji: string };
export interface Sample {
  readonly alpha: number;
  readonly luminance: number;
}
export function isEmoji(grapheme: string): boolean;
export function splitEmoji(text: string): Piece[];
export function isOnlyEmoji(text: string): boolean;
export function atkinson(values: readonly number[]): boolean[]; // SIZE×SIZE, row by row
export function pixelEmoji(samples: readonly Sample[]): Bitmap; // 16 rows of 16
export function drawnEmoji(emoji: string): Bitmap | undefined;
export const isBlankBitmap: (bitmap: Bitmap) => boolean;
// emoji-art.ts
export const EMOJI_ART: Readonly<Record<string, Bitmap>>; // 😀 😂 😍 😭
```

- [ ] **Step 1: Write the failing tests** (`emoji.test.ts`):

```ts
import { describe, expect, it } from 'vitest';
import { EMOJI_ART } from './emoji-art';
import { SIZE, drawnEmoji, isBlankBitmap, isOnlyEmoji, pixelEmoji, splitEmoji, type Sample } from './emoji';

describe('splitEmoji', () => {
  it('leaves text without emoji as one run', () => {
    expect(splitEmoji('plain text')).toEqual([{ text: 'plain text' }]);
  });
  it('cuts out each emoji', () => {
    expect(splitEmoji('Ship it 🚀!')).toEqual([{ text: 'Ship it ' }, { emoji: '🚀' }, { text: '!' }]);
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
    for (const text of ['🎉', '😂 👍', '🔥🔥🔥']) expect(isOnlyEmoji(text)).toBe(true);
  });
  it('fails for four, for any text, and for nothing', () => {
    for (const text of ['🔥🔥🔥🔥', 'ok 👍', '', '  ']) expect(isOnlyEmoji(text)).toBe(false);
  });
});

const samples = (at: (x: number, y: number) => Sample): Sample[] => Array.from({ length: SIZE * SIZE }, (_, i) => at(i % SIZE, Math.floor(i / SIZE)));
const clear: Sample = { alpha: 0, luminance: 1 };
const inDisc = (x: number, y: number) => (x - 7.5) ** 2 + (y - 7.5) ** 2 < 36;

describe('pixelEmoji', () => {
  it('draws nothing for nothing', () => {
    expect(isBlankBitmap(pixelEmoji(samples(() => clear)))).toBe(true);
  });
  it('keeps a black square solid', () => {
    const bitmap = pixelEmoji(samples((x, y) => (x >= 4 && x < 12 && y >= 4 && y < 12 ? { alpha: 1, luminance: 0 } : clear)));
    expect(bitmap[4]).toBe('....########....');
    expect(bitmap[8]).toBe('....########....');
    expect(bitmap).toHaveLength(SIZE);
  });
  it('outlines a white disc, leaving its inside paper', () => {
    const bitmap = pixelEmoji(samples((x, y) => (inDisc(x, y) ? { alpha: 1, luminance: 1 } : clear)));
    expect(bitmap[8]?.[2]).toBe('#'); // the disc's left edge
    expect(bitmap[8]?.[8]).toBe('.'); // its middle
  });
  it('keeps a grey dot inside a white disc as an edge', () => {
    // 0.6 stretches to 0.67, which dithers to paper: only the edge can ink it.
    const bitmap = pixelEmoji(samples((x, y) => (!inDisc(x, y) ? clear : { alpha: 1, luminance: x === 7 && y === 7 ? 0.6 : 1 })));
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
```

- [ ] **Step 2: Run them to see them fail.** `npx vitest run --root apps/frontend src/lib/emoji`: cannot find `./emoji`.

- [ ] **Step 3: Implement.** `emoji-art.ts` exports `EMOJI_ART` with the four faces from the comparison (rows in the session's `render.mjs` `HAND` table). `emoji.ts`:

```ts
import { EMOJI_ART } from './emoji-art';
import type { Bitmap } from './pixels';

export const SIZE = 16;
export type Piece = { readonly text: string } | { readonly emoji: string };
/** One pixel of an emoji shrunk to SIZE×SIZE: alpha 0–1, luminance 0 (black) to 1 over white. */
export interface Sample {
  readonly alpha: number;
  readonly luminance: number;
}

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
// Shown as emoji by default, or asked to be (U+FE0F), or a keycap.
const EMOJI = /\p{Emoji_Presentation}|\p{Extended_Pictographic}️|⃣/u;

export const isEmoji = (grapheme: string): boolean => EMOJI.test(grapheme);

export function splitEmoji(text: string): Piece[] {
  const pieces: Piece[] = [];
  let run = '';
  for (const { segment } of graphemes.segment(text)) {
    if (!isEmoji(segment)) {
      run += segment;
      continue;
    }
    if (run) pieces.push({ text: run });
    run = '';
    pieces.push({ emoji: segment });
  }
  if (run) pieces.push({ text: run });
  return pieces;
}

export function isOnlyEmoji(text: string): boolean {
  const pieces = splitEmoji(text.replace(/\s+/g, ''));
  return pieces.length >= 1 && pieces.length <= 3 && pieces.every((piece) => 'emoji' in piece);
}

/** Atkinson's dithering, as in MacPaint: ink below half, 6/8 of the error passed on. */
export function atkinson(values: readonly number[]): boolean[] {
  const v = [...values];
  const ink: boolean[] = [];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x;
      const old = v[i] ?? 1;
      ink[i] = old < 0.5;
      const error = (old - (ink[i] ? 0 : 1)) / 8;
      for (const [dx, dy] of [
        [1, 0],
        [2, 0],
        [-1, 1],
        [0, 1],
        [1, 1],
        [0, 2],
      ] as const) {
        const nx = x + dx,
          ny = y + dy;
        if (nx >= 0 && nx < SIZE && ny < SIZE) v[ny * SIZE + nx] = (v[ny * SIZE + nx] ?? 1) + error;
      }
    }
  }
  return ink;
}

/** The pixel art for an emoji: its dithered fill, its outline and its colour edges. */
export function pixelEmoji(samples: readonly Sample[]): Bitmap {
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < SIZE && y < SIZE;
  const inside = (x: number, y: number) => on(x, y) && (samples[y * SIZE + x]?.alpha ?? 0) > 0.4;
  const light = (x: number, y: number) => (on(x, y) ? samples[y * SIZE + x]?.luminance ?? 1 : 1);
  const fill = atkinson(samples.map(({ luminance }) => Math.min(1, Math.max(0, (luminance - 0.2) / 0.6))));
  return Array.from({ length: SIZE }, (_, y) =>
    Array.from({ length: SIZE }, (_, x) => {
      if (!inside(x, y)) return '.';
      const outline = !inside(x + 1, y) || !inside(x - 1, y) || !inside(x, y + 1) || !inside(x, y - 1);
      const edge = Math.abs(light(x, y) - light(x + 1, y)) > 0.3 || Math.abs(light(x, y) - light(x, y + 1)) > 0.3;
      return fill[y * SIZE + x] || outline || edge ? '#' : '.';
    }).join('')
  );
}

export const isBlankBitmap = (bitmap: Bitmap): boolean => bitmap.every((row) => !row.includes('#'));

const plain = (emoji: string) => emoji.replaceAll('️', '');
const DRAWN = new Map(Object.entries(EMOJI_ART).map(([emoji, art]) => [plain(emoji), art]));
/** A hand-drawn replacement, if someone made one; the variation selector doesn't matter. */
export const drawnEmoji = (emoji: string): Bitmap | undefined => DRAWN.get(plain(emoji));
```

- [ ] **Step 4: Run them to see them pass,** and run `npx tsc --noEmit -p apps/frontend/tsconfig.app.json`.

---

### Task 2: `PixelText`, everywhere names and messages show

**Files:**

- Create: `apps/frontend/src/app/components/PixelText.tsx` and `PixelText.module.css`
- Create: `apps/e2e/tests/emoji.spec.ts`
- Modify:
  - `MessageBubble.tsx`: the content, at 32 px when only emoji, and the sender's name;
  - `ChatListItem.tsx`: the title and the preview;
  - `MacWindow.tsx`: the `h2` title;
  - `MacDialog.tsx`: the `CardDouble` title;
  - `ChatWindow.tsx`: the names line;
  - `NewChatModal.tsx` and `AddPeopleDialog.tsx`: people's names;
  - `AppNavigation.tsx`: `status`.

**Interfaces:**

- Consumes: Task 1's `splitEmoji`, `isOnlyEmoji`, `pixelEmoji`, `drawnEmoji`, `isBlankBitmap`, `SIZE` and `Sample`, plus `pixelPath` from `lib/pixels.ts`.
- Produces: `PixelText({ text: string; size?: 16 | 32 })`.

- [ ] **Step 1: Write the failing e2e** (`emoji.spec.ts`). Test User sends "Morning 😀 🚀" to Charlie Brown, then "😀" on its own.

  - `pixel(scope, emoji)` finds `getByText(emoji, { exact: true })`, the invisible character, and takes its parent `locator('..')`.
  - In Charlie's chat window, the first 😀's parent has a computed `mask-image` (or `-webkit-mask-image`) containing `data:image/svg+xml`. It is 16 px tall, and its `background-color` equals the bubble's `color`.
  - The last 😀's parent is 32 px tall.
  - The bubble's text "Morning 😀 🚀" is visible.
  - In Charlie's chat list, the 😀 in the preview is masked too.

  Run `npm run e2e`: it fails, with no masked 😀 found.

- [ ] **Step 2: `PixelText`.**

```tsx
import type { CSSProperties } from 'react';
import { SIZE, drawnEmoji, isBlankBitmap, pixelEmoji, splitEmoji, type Sample } from '../../lib/emoji';
import { pixelPath, type Bitmap } from '../../lib/pixels';
import styles from './PixelText.module.css';

const FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
const CANVAS = 96;

/** This device's emoji, drawn big and shrunk to SIZE×SIZE; null without a canvas. */
function sample(emoji: string): Sample[] | null {
  const big = document.createElement('canvas');
  big.width = big.height = CANVAS;
  const draw = big.getContext('2d');
  const small = document.createElement('canvas');
  small.width = small.height = SIZE;
  const shrink = small.getContext('2d', { willReadFrequently: true });
  if (!draw || !shrink) return null;
  draw.font = `${CANVAS * 0.85}px ${FONT}`;
  draw.textAlign = 'center';
  draw.textBaseline = 'middle';
  draw.fillText(emoji, CANVAS / 2, CANVAS * 0.55);
  shrink.imageSmoothingQuality = 'high';
  shrink.drawImage(big, 0, 0, SIZE, SIZE);
  const { data } = shrink.getImageData(0, 0, SIZE, SIZE);
  return Array.from({ length: SIZE * SIZE }, (_, i) => {
    const alpha = (data[i * 4 + 3] ?? 0) / 255;
    const colour = (0.299 * (data[i * 4] ?? 0) + 0.587 * (data[i * 4 + 1] ?? 0) + 0.114 * (data[i * 4 + 2] ?? 0)) / 255;
    return { alpha, luminance: colour * alpha + (1 - alpha) }; // over white
  });
}

const maskOf = (bitmap: Bitmap) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" shape-rendering="crispEdges"><path d="${pixelPath(bitmap)}"/></svg>`)}")`;

// Each emoji's mask, made once a page; null where this device can't draw it.
const masks = new Map<string, string | null>();
function maskFor(emoji: string): string | null {
  const known = masks.get(emoji);
  if (known !== undefined) return known;
  const samples = drawnEmoji(emoji) ? null : sample(emoji);
  const bitmap = drawnEmoji(emoji) ?? (samples && pixelEmoji(samples));
  const mask = bitmap && !isBlankBitmap(bitmap) ? maskOf(bitmap) : null;
  masks.set(emoji, mask);
  return mask;
}

/** Text with each emoji as 1-bit pixel art in the text's colour; the characters stay, for copying and screen readers. */
export function PixelText({ text, size = 16 }: { text: string; size?: 16 | 32 }) {
  const pieces = splitEmoji(text);
  if (pieces.every((piece) => 'text' in piece)) return text;
  return pieces.map((piece, i) => {
    if ('text' in piece) return piece.text;
    const mask = maskFor(piece.emoji);
    if (!mask) return piece.emoji;
    return (
      <span key={i} className={size === 32 ? styles.big : styles.emoji} style={{ '--emoji': mask } as CSSProperties}>
        <span className={styles.char}>{piece.emoji}</span>
      </span>
    );
  });
}
```

CSS:

```css
/* 1-bit pixel art in the text's colour, through the emoji's mask. */
.emoji,
.big {
  display: inline-block;
  width: 16px;
  height: 16px;
  overflow: hidden;
  vertical-align: -3px;
  background: currentColor;
  -webkit-mask: var(--emoji) center / 100% 100% no-repeat;
  mask: var(--emoji) center / 100% 100% no-repeat;
}

.big {
  width: 32px;
  height: 32px;
  vertical-align: middle;
}

/* The real character, unseen: copying and screen readers still get it. */
.char {
  opacity: 0;
}
```

- [ ] **Step 3: Wire it in.**

  - **The bubble:** `MessageBubble` renders `<PixelText text={content} size={isOnlyEmoji(content) ? 32 : 16} />` for text, with `content = message.content ?? ''`, and the sender's name as `<PixelText text={message.sender.name} />`.
  - **Chat list:** `ChatListItem`'s title and preview go through `PixelText`. The fallbacks stay as they are, so the "Drawing" and "No messages yet" strings still pass through `PixelText` unchanged.
  - **Windows and dialogs:** `MacWindow` renders `<h2><PixelText text={title} /></h2>`, and its `aria-label` stays the plain string. `MacDialog` passes `title={<PixelText text={title} />}` to `CardDouble`, with the `aria-label` unchanged.
  - **Names:** `ChatWindow`'s names line becomes `<PixelText text={chat.participants.map(({ name }) => name).join(', ')} />`. `NewChatModal` and `AddPeopleDialog` render `<PixelText text={user.name} />`. `AppNavigation` passes `status={data?.me && <PixelText text={data.me.name} />}`.

- [ ] **Step 4: Check it.**
  - Run `npm run typecheck && npm run lint && npm run test && npm run e2e`; all pass.
  - Screenshot a chat with emoji in light, dark and a tint, and look at it.

---

### Task 3: Seed, screenshots and docs

**Files:**

- Modify: `apps/api/prisma/seed.ts`, `docs/screenshots/*`, `README.md`, `CLAUDE.md`, `docs/manual-testing.md`

- [ ] **Step 1: The seed.** Alice's `'Morning, everyone!'` becomes `'Morning, everyone! 😀'`.
- [ ] **Step 2: The pictures.** Run `npm run screenshots`, look at `themes.png` (the #general window shows Alice's message), and commit the results.
- [ ] **Step 3: The docs.**
  - **README:** add to "What it does": "**Pixel emoji.** Every emoji is redrawn as black-and-white pixel art in the theme's ink."
  - **CLAUDE.md:** add `emoji` to the `lib/` list, and this line under Gotchas: "Emoji are dithered from each device's own font (`lib/emoji.ts`). To replace one that comes out badly, add a 16×16 bitmap to `lib/emoji-art.ts`."
  - **manual-testing.md:** add a section 5 bullet: emoji in messages, the chat list, names and titles are pixel art in the text's colour, also in your own inverted bubbles and in dark mode. A message of one to three emoji shows them big, and copying a message gives the real emoji.
- [ ] **Step 4: Run everything, commit, push, watch CI.**
