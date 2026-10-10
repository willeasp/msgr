# Pixel emoji

_Design, agreed 2026-10-10. The second of three old-school projects, after drawings and before link previews._

## Goal

Every emoji in Msgr shows as 1-bit pixel art in the theme's ink, so a 🚀 in a message looks like it was drawn on a 1984 Macintosh instead of pasted from a phone. Emoji that dither badly can be replaced by hand.

## Scope

In:

- Message text, and sender names over the bubbles.
- The chat list: titles and last-message previews.
- Window and dialog titles.
- People's names in the people search, in Add People, and in a chat's people line.
- The viewer's name in the menu bar.
- Big emoji for messages that are only emoji.
- Hand-drawn overrides.

Out:

- **The message box while typing.** Sacred's vendored `TextArea` draws its own text, so emoji show in colour until sent.
- **Desktop notifications and the browser tab's title.** The OS draws those.
- **A bundled emoji set.** Each device dithers its own font.

## How an emoji becomes pixels

Each distinct emoji is turned into a 16×16 bitmap once per page load, then cached:

1. **Hand-drawn first.** If `lib/emoji-art.ts` has a bitmap for the emoji, that is the result.
   - Matching ignores U+FE0F, the variation selector that asks for emoji presentation, so one drawing covers ❤ and ❤️.
   - Everything else matches exactly; 👍🏽 is not 👍.
2. **Otherwise, dithered from the device's own emoji font.** Draw the emoji on a 96×96 canvas:

   - in the font stack `"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
   - at 81.6 px (0.85 of the canvas);
   - centred, with its middle 5% below the canvas's.

   Then shrink it to 16×16 with high-quality smoothing and read each pixel's alpha and luminance. Luminance is `0.299R + 0.587G + 0.114B`, composited over white. The pixel art follows from those:

   - **Silhouette:** the pixels with alpha above 0.4. Nothing outside it is ever ink.
   - **Contrast:** stretch luminance as `clamp((l − 0.2) / 0.6, 0, 1)`.
   - **Dither:** Atkinson. Scan rows top to bottom and pixels left to right. A pixel is ink below 0.5, and an eighth of its error goes to each of (x+1, y), (x+2, y), (x−1, y+1), (x, y+1), (x+1, y+1) and (x, y+2). The other quarter is dropped, as in MacPaint.
   - **Outline:** a silhouette pixel with any of its 4 neighbours outside the silhouette (or off the grid) is ink.
   - **Colour edges:** a silhouette pixel whose unstretched luminance differs by more than 0.3 from its right or lower neighbour is ink. A neighbour off the grid counts as white.

3. **Can't be drawn.** If the device's font has no picture for the emoji, the silhouette comes out empty. The emoji then shows as its ordinary character, never as a blank space.

These rules are the "contrast + outline + edges" row of the samples compared on 2026-10-10.

## Finding emoji in text

`splitEmoji(text)` cuts text into graphemes with `Intl.Segmenter`, which keeps a family (👨‍👩‍👧), a flag, a skin tone or a keycap as one piece. It groups them into runs of plain text and single emoji.

A grapheme is an emoji when either:

- it contains a character with `Emoji_Presentation`, which covers most emoji, flags and skin tones;
- or it contains `Extended_Pictographic` followed by U+FE0F, or a keycap (U+20E3).

So © ™ ↔ and a bare ❤ stay text ("© 2026" stays as it is), while ❤️ and 1️⃣ are emoji.

`isOnlyEmoji(text)`: once whitespace is removed, the text is one to three emoji and nothing else.

## Drawing it on the page

`PixelText` takes a string and renders its plain runs as text and each emoji as:

```html
<span class="emoji" style="--emoji: url(data:image/svg+xml,…)"><span class="char">🚀</span></span>
```

- The outer span is an inline block, 16×16 px, set 3 px below the baseline.
- It is painted `background: currentColor` through the bitmap as a mask (`mask-image`, plus `-webkit-mask-image` for Safari). The emoji is therefore in whatever colour the text is: ink in a bubble, paper in the viewer's inverted bubbles, and the theme's colours in dark mode and the tints.
- The mask is an SVG of the bitmap, built with the existing `pixelPath` and drawn with `shape-rendering="crispEdges"`, so it stays sharp at 16 and 32 px on any screen. CSP already allows `data:` images.
- The inner span holds the real character at `opacity: 0`. Copying still gives "🚀", and screen readers still read the emoji.
- `size={32}` draws the same bitmap at 2×. `MessageBubble` uses it when `isOnlyEmoji(content)`, and the bubble's line height grows to fit.

## Where it goes

Wrap each of these strings in `PixelText`:

- `MessageBubble`: the content, and the sender's name.
- `ChatListItem`: the title and the preview.
- `MacWindow`: the visible title. Its `aria-label` stays the plain string.
- `MacDialog`: the title passed to Sacred's `CardDouble`, which takes any node. Its `aria-label` stays the plain string.
- `ChatWindow`: the names in the people line.
- `NewChatModal` and `AddPeopleDialog`: people's names.
- The menu bar's name of the viewer, if Sacred's `Navigation` takes a node. If it only takes a string, leave it.

Channel names can't contain emoji, since they are lower-case letters, digits and dashes.

## Code

- `lib/emoji.ts`, with `lib/emoji.test.ts`: `splitEmoji`, `isOnlyEmoji`, and the pixel steps as pure functions from `{ alpha, luminance }` arrays to a 16×16 `Bitmap`: `pixelEmoji(samples)`, built from silhouette, contrast, `atkinson`, outline and colour edges. It also has the override lookup, `drawnEmoji(emoji)`. No DOM.
- `lib/emoji-art.ts`: the hand-drawn overrides, `Record<string, Bitmap>`. It ships with the four faces from the comparison: 😀 😂 😍 😭.
- `app/components/PixelText.tsx`, with its CSS module: the component, the canvas sampling (the only DOM part) and the cache.
- CLAUDE.md: `emoji` joins the `lib/` list, plus one line saying that to replace an emoji that dithers badly, you add a 16×16 bitmap to `lib/emoji-art.ts`.

## Testing

- **`lib/emoji.test.ts`:**
  - Text without emoji is one plain run.
  - "Ship it 🚀" is a run and an emoji.
  - 👨‍👩‍👧, 🇸🇪, 👍🏽 and 1️⃣ are one emoji each.
  - © ™ and a bare ❤ stay text, while ❤️ is an emoji.
  - `isOnlyEmoji` holds for "🎉", "😂 👍" and "🔥🔥🔥", but not for four emoji, "ok 👍" or an empty string.
- **The pixel steps**, on made-up samples, so no font is needed:
  - fully transparent gives an empty bitmap;
  - an opaque black square gives a solid square;
  - an opaque white disc gives only its outline;
  - a dark dot inside a white disc survives as colour-edge ink;
  - the output is always 16 rows of 16.
- **The overrides:** every entry in `emoji-art.ts` is 16 rows of 16 `#`/`.`. `drawnEmoji` strips U+FE0F from both the emoji and the table's keys, so looking up "😀" followed by U+FE0F finds 😀's drawing.
- **Browser (`apps/e2e/tests/emoji.spec.ts`):** Test User sends "Morning 😀 🚀" to Charlie, who sees it live.

  - The 😀 is a masked `.emoji` span 16 px tall, and the text still contains "😀".
  - "😀" sent on its own shows 32 px tall.
  - Charlie's chat-list preview holds the masked 😀 too.

  The assertions use 😀 because it's hand-drawn: CI's Linux machines may have no emoji font, and a hand-drawn emoji looks the same everywhere. The 🚀 only needs to stay as text, pixel art or not.

- **README pictures:** the seed's "Morning, everyone!" becomes "Morning, everyone! 😀". The screenshots then show a pixel emoji, and come out the same on any machine. Run `npm run screenshots`, look at the results and commit them.

## Later

Hand-drawn versions of more emoji that dither badly, one entry at a time. Link previews get their own spec.
