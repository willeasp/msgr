# Drawings: MacPaint in the message box

_Design, agreed 2026-10-10. The first of three old-school projects; pixel emoji and link previews follow, each with its own spec._

## Goal

Friends draw small black-and-white pictures and send them to each other as messages, and anyone can draw on a picture they received and send it back. It should feel like MacPaint on a 1984 Macintosh, and be fun enough that people actually do it.

## Scope

In: a paint window with a pencil, brush, paint bucket, eraser, eight patterns, undo and clear; drawings as a new kind of message, live like any other; **Draw on It** on every drawing.

Out, on purpose: a **File → New Drawing…** menu item (the button is enough), brush sizes, a text tool, shapes, selection, saved drafts, uploaded images.

## Vocabulary

`CONTEXT.md` changes:

- **Message**: _Text or a drawing_ a participant posted to a chat at a point in time. Text is trimmed and non-blank.
- **Drawing** (new): A 256×160 black-and-white picture made in the paint window and sent as a message. It is never blank. _Avoid_: doodle, sketch, image.

## The bitmap

- 256×160 pixels, 1 bit each: 5,120 bytes.
- Rows top to bottom; 8 pixels a byte, the leftmost in the high bit; 1 is ink, 0 is paper (the layout of a PBM `P4` file).
- On the wire and in the database it is that byte string in standard base64 with padding: 6,828 characters.

## API

### Domain (`domain/drawing.ts`, `domain/message.ts`)

- `Drawing = Brand<string, 'Drawing'>`, with `Drawing.WIDTH = 256`, `Drawing.HEIGHT = 160` and `Drawing.parse(raw: string): Result<Drawing, InvalidInput>`. It rejects, on the field `drawing`:
  - anything that isn't canonical base64 (decoding and re-encoding must give back the same string);
  - any length other than 5,120 bytes;
  - a blank picture, every byte 0 ("Drawing must not be blank").
- `Message = TextMessage | DrawingMessage`, discriminated by `kind: 'text' | 'drawing'`. A text message has `content: MessageContent`; a drawing message has `drawing: Drawing`. Shared fields stay as they are. `NewMessage` follows the same union.

### Database

One migration on `Message`:

- `content` becomes nullable.
- New nullable column `drawing TEXT`.
- `CHECK ((content IS NULL) <> (drawing IS NULL))`: exactly one is set.

Every existing row has `content`, so it stays valid. The Prisma adapter maps a row to `TextMessage` or `DrawingMessage` by which column is set; a row with neither is a defect and throws.

### Service (`application/message.service.ts`)

`messages.sendDrawing(viewer, { chatId, drawing })`: parse the drawing, check the chat is visible to the viewer (`visibleTo`, so a chat you're not in answers like a missing one), store it, publish it on the message events, and return it. It shares its check-store-publish steps with `send`, so the two can't drift apart.

### GraphQL (`graphql/schema.ts`)

```graphql
enum MessageKind {
  TEXT
  DRAWING
}

type Message {
  id: ID!
  kind: MessageKind!
  "The text; null for a drawing."
  content: String
  "A 256×160 black-and-white picture: rows top to bottom, 8 pixels a byte with the leftmost in the high bit, 1 for ink, in base64. Null for text."
  drawing: String
  sender: User!
  chat: Chat!
  createdAt: DateTime!
}

input SendDrawingInput {
  chatId: ID!
  drawing: String!
}

# Mutation
sendDrawing(input: SendDrawingInput!): Message!
```

One `Message` type with a `kind`, as `Chat` has. Making `content` nullable breaks the schema for other clients; the app is the only one. Resolvers stay one-liners: `kind` maps the domain's lower-case kind, and `content`/`drawing` read the field or return null.

## The paint window (`PaintDialog`)

Opened through the modal stack: `open(PaintDialog, { chatId, chatTitle, start? })`, from a **Draw…** button beside **Send** in the message box (blank canvas), or from **Draw on It** under a drawing (`start` is that drawing). Its title is "Drawing for _chat title_".

```
┌──────────────── Drawing for Alice Johnson ────────────────┐
│ ┌──┐ ┌──────────────────────────────────────────────────┐ │
│ │✎ │ │                                                  │ │
│ │🖌 │ │              256×160 canvas, shown 2×            │ │
│ │◪ │ │                                                  │ │
│ │▭ │ │                                                  │ │
│ ├──┤ │                                                  │ │
│ │↶ │ │                                                  │ │
│ │✕ │ └──────────────────────────────────────────────────┘ │
│ └──┘  [■][▓][▒][░][□][≡][⧅][▦]                            │
│                                       [ Cancel ] [ Send ] │
└───────────────────────────────────────────────────────────┘
```

### Tools

- **Pencil**: 1-pixel lines. A stroke that starts on ink draws paper, as MacPaint's did, so small fixes don't need the eraser.
- **Brush**: a round 5×5 dab, painted in the chosen pattern.
- **Paint bucket**: fills the 4-connected area of the clicked pixel's colour with the chosen pattern, so a one-pixel diagonal gap holds the fill in.
- **Eraser**: an 8×8 square that rubs out to paper.
- **Undo**: up to 20 steps; also <kbd>⌘</kbd>/<kbd>Ctrl</kbd> <kbd>Z</kbd>. A step is one stroke, one fill or one clear.
- **Clear**: wipes the canvas; undoable.
- **Patterns**: eight 8×8 MacPaint patterns, black, dark grey, grey, light grey, white, horizontal lines, diagonal lines and bricks, anchored to the canvas (pixel _x_, _y_ takes the pattern's _x_ mod 8, _y_ mod 8) so overlapping strokes join seamlessly. Black is chosen at first; the pencil and eraser ignore the pattern.

Strokes join consecutive pointer positions with straight lines, so a fast stroke leaves no gaps.

### Sending and closing

- **Send** is disabled while the canvas is blank, and reads "Sending" while the mutation runs. Success closes the window; the sent drawing joins the chat's cached history the way `MessageInput` adds a text message.
- A failed send shows the error in the window and keeps the drawing.
- **Cancel** and <kbd>Escape</kbd> close at once if nothing has been drawn since the window opened; otherwise they ask "Discard this drawing?" with **Keep Drawing** and **Discard**.

### Screen sizes

The canvas shows at 2× on the desktop and 1× when narrow (the chat page's `NARROW` query), always a whole-number scale with pixelated rendering. When narrow the tools sit in a row above the canvas and the patterns below it. The canvas has `touch-action: none`, so dragging draws instead of scrolling, and uses pointer events with pointer capture for mouse, pen and touch alike. It is drawn in the theme's `--ink` on `--paper`.

### Code

- `lib/paint.ts`, with `lib/paint.test.ts`: the bitmap (a `Uint8Array` of 5,120 bytes plus pixel get/set), lines between points, the pencil, brush and eraser stamps, flood fill, the patterns, blankness, and base64 in both directions. No DOM.
- `components/chat/PaintDialog.tsx` and its CSS module: tool state, the undo stack, pointer events, drawing the bitmap to the canvas, and the `sendDrawing` mutation.
- New 1-bit tool icons (pencil, brush, bucket, eraser, undo, clear) as `Bitmap`s for `PixelIcon`.

## Drawings in a chat

- `MessageBubble` shows a drawing inside the usual bubble as a framed picture: `--ink` on `--paper` with a 1-pixel frame, 2× on the desktop and 1× when narrow, so dark mode and the tints apply. It is `role="img"` with the label "Drawing"; the sender and time are already above it.
- A small **Draw on It** button under every drawing, the viewer's own included, opens the paint window with it. Sending makes a new message; the original is unchanged.
- The chat list's preview of a drawing reads "Drawing". A desktop notification for one reads "Sent a drawing." and beeps like any other.
- History (`GET_CHAT_MESSAGES`), the live feed (`useChatFeed`) and `sendDrawing` select `kind`, `content` and `drawing`. The chat list selects `kind` and `content` for its latest message, never the bitmap. `withReceivedMessage` and `ReceivedMessage` carry the new fields.

## Errors

- Bad input (wrong size, malformed, blank) is an `InvalidInput` on `drawing`, mapped like every other invalid input. The paint window only sends what it made, so a person sees this only if something is broken; it shows as the send error.
- Not in the chat: the same not-found answer as for text.
- A database row with neither or both columns is impossible by the CHECK; the adapter throws if it ever sees one.

## Testing

- **Domain** (`domain/drawing.test.ts`): `Drawing.parse` rejects the wrong length, non-canonical base64 and a blank picture, and accepts a real one.
- **Service** (`application/message.service.test.ts`): `sendDrawing` stores the drawing and publishes it; a chat the viewer isn't in answers like a missing one; a bad drawing stores nothing.
- **Repository contract** (`testing/repository-contract.ts`): a drawing message reads back unchanged, in pages and by id, from the in-memory and Prisma adapters. Run the Postgres contract before merging.
- **GraphQL** (`graphql/resolvers.test.ts`): `sendDrawing` end to end; `messages` returns `kind: DRAWING`, the drawing and `content: null`.
- **`lib/paint.test.ts`**: a fast stroke has no gaps; the pencil draws paper when it starts on ink; patterns are anchored to the canvas; the bucket stops at a one-pixel diagonal gap and fills patterned areas without looping; base64 round-trips; a blank bitmap is blank.
- **Browser** (`apps/e2e/tests/drawing.spec.ts`): Test User draws with the mouse and sends; Alice, in a second browser, sees it arrive live, uses **Draw on It**, adds a stroke and sends it back; Cancel on a canvas with something on it asks before discarding.
- **README**: a "What it does" bullet, and one new screenshot of the paint window (`paint.png`), drawn with the mouse by `apps/e2e/screenshots/readme.spec.ts`. The seed stays as it is, so the existing pictures don't change.

## Later

Pixel emoji (dithering the device's own emoji to 1-bit, Atkinson-style) and old-school link previews (fetched by the server behind SSRF guards, images dithered) get their own specs after this ships.
