# Drawings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** People draw 256×160 black-and-white pictures in a MacPaint-style window and send them as messages; anyone can draw on a received picture and send it back.

**Architecture:** A drawing is a second kind of message. The API parses it into a branded `Drawing` at the service boundary, stores it in a new nullable `drawing` column beside a now-nullable `content` (a CHECK keeps exactly one), and sends it over the existing feed. The frontend keeps all bitmap logic in `lib/paint.ts`; one hook paints a bitmap onto a `<canvas>` in the theme's colours, used by both the bubble and the paint window.

**Tech Stack:** TypeScript, Prisma on Postgres, Apollo Server and Client, React 19, Vitest, Playwright.

**Spec:** [docs/superpowers/specs/2026-10-10-macpaint-drawings-design.md](../specs/2026-10-10-macpaint-drawings-design.md)

## Global Constraints

- Canvas: 256×160 pixels, 1 bit each, 5,120 bytes; rows top to bottom, 8 pixels a byte, leftmost in the high bit, 1 is ink; standard padded base64 (6,828 characters).
- The domain stays pure: no Node APIs, no I/O. `atob`/`btoa` are web-standard globals and fine.
- Layer rule: `domain` ← `application` ← `infrastructure` / `graphql` (ESLint enforces it).
- Resolvers stay one-liners; `graphql/errors.ts` is the only error mapping.
- Styling: CSS Modules with `--ink` / `--paper`; inversion is the only highlight; vendored Sacred components are not edited.
- Copy, verbatim: "Draw…", "Draw on It", "Drawing for _chat title_", "Drawing" (chat-list preview and the picture's accessible name), "Sent a drawing." (notification body), "Discard this drawing?", "Keep Drawing", "Discard", "Sending", "Drawing must not be blank".
- Tools: pencil (1 px, draws paper when the stroke starts on ink), brush (5×5 round, patterned), bucket (4-connected, patterned), eraser (8×8), undo (20 steps, ⌘Z / Ctrl Z), clear (undoable); eight patterns anchored to the canvas.
- Never run wiping tests against Prisma dev or `hansa-dev-postgres-1`; the contract and e2e use `msgr-test-pg` on :55432.

One change from the spec: the GraphQL `Message` gets no `kind` field. Which of `content` and `drawing` is non-null already says it, and TypeScript narrows on `drawing != null` but not on a separate enum. The spec is updated to match in Task 4.

## Review Focus

- A drawing stroke that leaves the canvas while the button is held keeps drawing at the edge and doesn't throw: pointer capture plus out-of-range `setPixel` being a no-op. Test: `setPixel` outside the canvas changes nothing (Task 5).
- The bucket on a region already in the pattern's colours, e.g. black on black, finishes instead of looping. Test: filling a black canvas with black terminates and changes nothing (Task 5).
- Changing the theme while drawings are on screen repaints them, so no white-paper picture is left in a dark window. Test: the e2e switches to dark mode and checks the picture's canvas paints its paper in the dark theme's paper colour (Task 8).
- Undo after Clear brings the drawing back, and Undo with nothing to undo does nothing. Test: e2e draws, clears, undoes, and the Send button is back (enabled only while non-blank) (Task 8).
- The chat list preview and notifications of a drawing never say "null". Covered by typecheck (content is `string | null`) and the e2e check of the preview text "Drawing" (Task 8).

---

### Task 1: The `Drawing` value

**Files:**

- Create: `apps/api/src/domain/drawing.ts`
- Test: `apps/api/src/domain/drawing.test.ts`

**Interfaces:**

- Produces: `type Drawing = Brand<string, 'Drawing'>`; `Drawing.WIDTH = 256`, `Drawing.HEIGHT = 160`, `Drawing.BYTES = 5120`; `Drawing.parse(raw: string): Result<Drawing, InvalidInput>` with `field: 'drawing'`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { Drawing } from './drawing.js';

const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const picture = () => {
  const bytes = new Uint8Array(Drawing.BYTES);
  bytes[100] = 0b1000_0001;
  return bytes;
};
const reasonFor = (raw: string) => {
  const result = Drawing.parse(raw);
  return result.ok ? null : result.error;
};

describe('Drawing.parse', () => {
  it('accepts a 256×160 picture with some ink', () => {
    const raw = encode(picture());
    expect(Drawing.parse(raw)).toEqual({ ok: true, value: raw });
  });

  it('rejects a blank picture', () => {
    expect(reasonFor(encode(new Uint8Array(Drawing.BYTES)))).toEqual({
      type: 'InvalidInput',
      field: 'drawing',
      reason: 'Drawing must not be blank',
    });
  });

  it('rejects any other size', () => {
    for (const size of [0, Drawing.BYTES - 1, Drawing.BYTES + 1]) {
      const bytes = new Uint8Array(size).fill(1);
      expect(reasonFor(encode(bytes))).toMatchObject({ field: 'drawing' });
    }
  });

  it('rejects text that is not canonical base64', () => {
    const raw = encode(picture());
    for (const bad of ['not base64!', ` ${raw}`, raw.replace(/=+$/, '')]) {
      expect(reasonFor(bad)).toMatchObject({ field: 'drawing' });
    }
  });
});
```

Note: 5,120 bytes is a multiple of 3 plus 2, so the canonical encoding ends in `=`; stripping it must be rejected.

- [ ] **Step 2: Run it to see it fail**

Run: `npx nx test @msgr/api -- src/domain/drawing`
Expected: FAIL, cannot find `./drawing.js`.

- [ ] **Step 3: Implement**

```ts
import type { Brand } from './brand.js';
import { invalidInput, type InvalidInput } from './errors.js';
import { err, ok, type Result } from './result.js';

/**
 * A 256×160 black-and-white picture: rows top to bottom, 8 pixels a byte with
 * the leftmost in the high bit, 1 for ink, in standard base64. Never blank.
 */
export type Drawing = Brand<string, 'Drawing'>;
export const Drawing = {
  WIDTH: 256,
  HEIGHT: 160,
  BYTES: (256 * 160) / 8,
  parse(raw: string): Result<Drawing, InvalidInput> {
    let bytes: string;
    try {
      bytes = atob(raw);
    } catch {
      return err(invalidInput('drawing', 'Drawing must be base64'));
    }
    // atob forgives whitespace and missing padding; one spelling per picture.
    if (btoa(bytes) !== raw) {
      return err(invalidInput('drawing', 'Drawing must be base64'));
    }
    if (bytes.length !== Drawing.BYTES) {
      return err(invalidInput('drawing', `Drawing must be ${Drawing.WIDTH}×${Drawing.HEIGHT} pixels`));
    }
    if (!/[^\0]/.test(bytes)) {
      return err(invalidInput('drawing', 'Drawing must not be blank'));
    }
    return ok(raw as Drawing);
  },
};
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx nx test @msgr/api -- src/domain/drawing`
Expected: PASS, 4 tests.

---

### Task 2: Messages are text or a drawing, stored either way

**Files:**

- Modify: `apps/api/src/domain/message.ts`
- Modify: `apps/api/prisma/schema.prisma` (`Message.content String?`, new `drawing String?`)
- Create: `apps/api/prisma/migrations/20261010120000_drawings/migration.sql`
- Modify: `apps/api/src/infrastructure/prisma/message.repository.ts`
- Modify: `apps/api/src/testing/repository-contract.ts`
- Modify: `apps/api/src/application/message.service.ts` (`send` builds `kind: 'text'`)
- Modify: `apps/api/src/application/message.service.test.ts` (the expected message gains `kind: 'text'`)

**Interfaces:**

- Consumes: `Drawing` (Task 1).
- Produces:

```ts
interface Sent {
  readonly id: MessageId;
  readonly chatId: ChatId;
  readonly senderId: UserId;
  readonly createdAt: Date;
}
export interface TextMessage extends Sent {
  readonly kind: 'text';
  readonly content: MessageContent;
}
export interface DrawingMessage extends Sent {
  readonly kind: 'drawing';
  readonly drawing: Drawing;
}
export type Message = TextMessage | DrawingMessage;
/** What a message says, whichever kind it is. */
export type MessageBody = Pick<TextMessage, 'kind' | 'content'> | Pick<DrawingMessage, 'kind' | 'drawing'>;
/** A message that has been accepted but not yet stored. */
export type NewMessage = MessageBody & Omit<Sent, 'id'>;
```

- [ ] **Step 1: Write the failing contract test.** In `repository-contract.ts`, give the `send` helper `kind: 'text'`, and add to `describe('messages')`:

```ts
it('stores a drawing and reads it back unchanged', async () => {
  const ada = await fixtures.user({ name: 'Ada' });
  const grace = await fixtures.user({ name: 'Grace' });
  const chat = await repositories.chats.saveDirect(pairOf(ada, grace));
  const text = await send(chat, ada, 'look', '2030-01-01T00:00:00Z');
  const bytes = new Uint8Array(Drawing.BYTES);
  bytes[0] = 0xff;
  const drawing = await repositories.messages.append({
    kind: 'drawing',
    chatId: chat.id,
    senderId: grace.id,
    drawing: btoa(String.fromCharCode(...bytes)) as Drawing,
    createdAt: new Date('2030-01-01T00:01:00Z'),
  });

  expect(drawing).toMatchObject({ kind: 'drawing', senderId: grace.id });
  expect(drawing).not.toHaveProperty('content');
  expect(await repositories.messages.findPages([chat.id], { limit: 5, offset: 0 })).toEqual([text, drawing]);
});
```

- [ ] **Step 2: Change the domain** to the types above and update `send` in `message.service.ts` to append `{ kind: 'text', content: content.value, … }`. Typecheck (`npm run typecheck`) now points at the adapters.

- [ ] **Step 3: Schema and migration.** In `schema.prisma`: `content String?` and `drawing String?` on `Message`. Write the migration by hand, then confirm Prisma agrees (expect an empty diff apart from the CHECK) against a scratch database on the test server:

```sql
-- AlterTable
ALTER TABLE "Message" ALTER COLUMN "content" DROP NOT NULL,
ADD COLUMN     "drawing" TEXT;

-- A message is exactly one of: text or a drawing.
ALTER TABLE "Message" ADD CONSTRAINT "Message_kind_check"
  CHECK (num_nonnulls("content", "drawing") = 1);
```

```bash
docker exec msgr-test-pg psql -U postgres -c 'CREATE DATABASE msgr_shadow'
cd apps/api && npx prisma migrate diff --from-migrations prisma/migrations \
  --to-schema-datamodel prisma/schema.prisma \
  --shadow-database-url postgresql://postgres:postgres@localhost:55432/msgr_shadow --script
docker exec msgr-test-pg psql -U postgres -c 'DROP DATABASE msgr_shadow'
npm run db:generate
```

- [ ] **Step 4: Prisma adapter.** Select `drawing` too (in `messageFields` and the raw `SELECT`), write whichever field the body has, and map rows by which column is set:

```ts
async append(message) {
  const { chatId, senderId, createdAt } = message;
  const body =
    message.kind === 'text'
      ? { content: message.content }
      : { drawing: message.drawing };
  const [row] = await db.$transaction([
    db.message.create({
      data: { chatId, senderId, createdAt, ...body },
      select: messageFields,
    }),
    db.chat.update({ … unchanged … }),
  ]);
  return toMessage(row);
},

const toMessage = ({ id, chatId, senderId, content, drawing, createdAt }: MessageRow): Message => {
  const sent = { id: MessageId(id), chatId: ChatId(chatId), senderId: UserId(senderId), createdAt };
  if (content !== null) return { ...sent, kind: 'text', content: content as MessageContent };
  if (drawing !== null) return { ...sent, kind: 'drawing', drawing: drawing as Drawing };
  throw new Error(`Message ${id} has neither text nor a drawing`);
};
```

The in-memory adapter already spreads its input and needs no change.

- [ ] **Step 5: Run the API tests, then the Postgres contract**

```bash
npx nx test @msgr/api
export TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/msgr_test
DATABASE_URL=$TEST_DATABASE_URL npm --workspace=@msgr/api exec prisma migrate deploy
npx nx test @msgr/api
```

Expected: all pass, the new contract test included, on both adapters.

---

### Task 3: `messages.sendDrawing`

**Files:**

- Modify: `apps/api/src/application/message.service.ts`
- Test: `apps/api/src/application/message.service.test.ts`

**Interfaces:**

- Produces: `sendDrawing(viewer: User, input: { readonly chatId: string; readonly drawing: string }): Promise<Result<Message, InvalidInput | NotFound>>`.

- [ ] **Step 1: Write the failing tests** (a `describe('sending a drawing')` block next to the text one):

```ts
const drawing = (() => {
  const bytes = new Uint8Array(Drawing.BYTES);
  bytes[42] = 0b0011_1100;
  return btoa(String.fromCharCode(...bytes));
})();

describe('sending a drawing', () => {
  it('stores it, stamped by the clock, and delivers it live', async () => {
    const { services, ada, grace, linus, chat } = await team();
    const toGrace = nextEvent(services().messages.feed(grace));
    const toLinus = nextEvent(services().messages.feed(linus));

    const message = expectOk(await services().messages.sendDrawing(ada, { chatId: chat.id, drawing }));

    expect(message).toEqual({
      id: message.id,
      kind: 'drawing',
      chatId: chat.id,
      senderId: ada.id,
      drawing,
      createdAt: expect.any(Date),
    });
    expect(await toGrace).toEqual(message);
    expect(await toLinus).toBe('nothing');
  });

  it('rejects a bad drawing before looking at the chat, storing nothing', async () => {
    const { services, ada, chat } = await team();
    const blank = btoa(String.fromCharCode(...new Uint8Array(Drawing.BYTES)));

    expect(await services().messages.sendDrawing(ada, { chatId: 'missing', drawing: blank })).toMatchObject({ ok: false, error: { type: 'InvalidInput', field: 'drawing' } });
    expect(expectOk(await services().messages.list(ada, { chatId: chat.id }))).toEqual([]);
  });

  it("refuses to post into someone else's chat", async () => {
    const { services, linus, chat } = await team();

    expect(await services().messages.sendDrawing(linus, { chatId: chat.id, drawing })).toEqual({ ok: false, error: { type: 'NotFound', entity: 'Chat' } });
  });
});
```

- [ ] **Step 2: Run them to see them fail.** `npx nx test @msgr/api -- src/application/message`: `sendDrawing` is not a function.

- [ ] **Step 3: Implement**, sharing the check-store-publish steps:

```ts
/** Stores the message, then delivers it live to every participant. */
async function post(viewer: User, chatId: string, body: MessageBody): Promise<Result<Message, NotFound>> {
  const chat = visibleTo(await loaders.chat.load(ChatId(chatId)), viewer.id);
  if (!chat.ok) return chat;
  const message = await repositories.messages.append({
    ...body,
    chatId: chat.value.id,
    senderId: viewer.id,
    createdAt: clock(),
  });
  await events.publish(message, chat.value.participantIds);
  return ok(message);
}
// send: parse content, then `post(viewer, input.chatId, { kind: 'text', content: content.value })`
// sendDrawing: parse drawing, then `post(viewer, input.chatId, { kind: 'drawing', drawing: drawing.value })`
```

- [ ] **Step 4: Run them to see them pass**, with the rest of the API suite.

---

### Task 4: GraphQL `drawing` and `sendDrawing`

**Files:**

- Modify: `apps/api/src/graphql/schema.ts`, `apps/api/src/graphql/resolvers.ts`
- Test: `apps/api/src/graphql/resolvers.test.ts`
- Modify: the spec (drop `kind` from the GraphQL section)

**Interfaces:**

- Produces (schema):

```graphql
type Message {
  id: ID!
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
# Mutation:
"Sends a drawing, made in the paint window, as a message."
sendDrawing(input: SendDrawingInput!): Message!
```

- [ ] **Step 1: Write the failing test** in `describe('messages')`:

```ts
it('sends a drawing, read back with no text', async () => {
  const { app, ada, team } = await world();
  const bytes = new Uint8Array(256 * 20);
  bytes[7] = 1;
  const drawing = btoa(String.fromCharCode(...bytes));

  const sent = await execute(
    app,
    `mutation ($chatId: ID!, $drawing: String!) {
      sendDrawing(input: { chatId: $chatId, drawing: $drawing }) { content drawing }
    }`,
    { as: ada, variables: { chatId: team.id, drawing } }
  );
  const read = await execute(app, 'query ($id: ID!) { messages(chatId: $id) { content drawing sender { name } } }', { as: ada, variables: { id: team.id } });

  expect(sent.data).toEqual({ sendDrawing: { content: null, drawing } });
  expect(read.data).toEqual({
    messages: [{ content: null, drawing, sender: { name: 'Ada' } }],
  });
});

it('rejects a blank drawing as bad input', async () => {
  const { app, ada, team } = await world();
  const blank = btoa(String.fromCharCode(...new Uint8Array(256 * 20)));

  const result = await execute(
    app,
    `mutation ($chatId: ID!, $drawing: String!) {
      sendDrawing(input: { chatId: $chatId, drawing: $drawing }) { id }
    }`,
    { as: ada, variables: { chatId: team.id, drawing: blank } }
  );

  expect(codeOf(result)).toBe('BAD_USER_INPUT');
  expect(result.errors?.[0]?.extensions['field']).toBe('drawing');
});
```

- [ ] **Step 2: Schema and resolver.** Edit the schema as above, then `npm run codegen`. Add one resolver line:

```ts
sendDrawing: async (_, { input }, ctx) =>
  unwrap(await ctx.services.messages.sendDrawing(requireViewer(ctx), input)),
```

The default resolvers read `content` and `drawing`; the kind without one has no such property, so it resolves to null.

- [ ] **Step 3: Run the API suite and typecheck.** `npx nx test @msgr/api && npm run typecheck`. The frontend typecheck now fails wherever `content` is assumed to be a string; Task 6 fixes those.

- [ ] **Step 4: Update the spec's GraphQL section** to the schema above (no `MessageKind`) and say why in one line.

---

### Task 5: `lib/paint.ts`, the bitmap and its tools

**Files:**

- Create: `apps/frontend/src/lib/paint.ts`
- Test: `apps/frontend/src/lib/paint.test.ts`

**Interfaces:**

- Produces:

```ts
export const WIDTH = 256;
export const HEIGHT = 160;
export interface Point {
  readonly x: number;
  readonly y: number;
}
/** 8 rows of 8 pixels, one byte a row, the leftmost in the high bit. */
export type Pattern = readonly number[];
export const PATTERNS: readonly { readonly name: string; readonly rows: Pattern }[];
export type Brush = 'pencil' | 'brush' | 'eraser';

export function blank(): Uint8Array;
export function getPixel(bits: Uint8Array, x: number, y: number): boolean;
/** Off the canvas, does nothing. */
export function setPixel(bits: Uint8Array, x: number, y: number, ink: boolean): void;
export function isBlank(bits: Uint8Array): boolean;
export function patternInk(pattern: Pattern, x: number, y: number): boolean;
/** Every point from `from` to `to`, both included, with no gaps. */
export function line(from: Point, to: Point): Point[];
/** One stretch of a stroke: the brush's stamp at every point along it. */
export function paintStroke(bits: Uint8Array, brush: Brush, from: Point, to: Point, options: { readonly ink: boolean; readonly pattern: Pattern }): void;
/** The bucket: the 4-connected area of the colour at (x, y), in `pattern`. */
export function fill(bits: Uint8Array, x: number, y: number, pattern: Pattern): void;
/** Each row's runs of ink: [x, y, length]. */
export function inkRuns(bits: Uint8Array): [number, number, number][];
export function toBase64(bits: Uint8Array): string;
export function fromBase64(text: string): Uint8Array;
/** A pattern tiled to `width`×`height`, for a swatch drawn by PixelIcon. */
export function swatch(pattern: Pattern, width: number, height: number): Bitmap;
```

Patterns, in order: Black `FF×8`; Dark grey `DD 77 DD 77 DD 77 DD 77`; Grey `AA 55 AA 55 AA 55 AA 55`; Light grey `88 22 88 22 88 22 88 22`; White `00×8`; Horizontal lines `FF 00 00 00 FF 00 00 00`; Diagonal lines `01 02 04 08 10 20 40 80`; Bricks `FF 80 80 80 FF 08 08 08`.

Stamps: pencil, one pixel of `ink`; brush, the 5×5 disc (the square minus its four corners) centred on the point, each pixel set to `patternInk(pattern, x, y)`; eraser, the 8×8 square from (x − 4, y − 4), set to paper.

- [ ] **Step 1: Write the failing tests:**

```ts
import { describe, expect, it } from 'vitest';
import { HEIGHT, PATTERNS, WIDTH, blank, fill, fromBase64, getPixel, inkRuns, isBlank, line, paintStroke, patternInk, setPixel, swatch, toBase64 } from './paint';

const black = PATTERNS[0]!.rows;
const grey = PATTERNS.find(({ name }) => name === 'Grey')!.rows;

describe('the bitmap', () => {
  it('sets and reads pixels, leftmost in the high bit', () => {
    const bits = blank();
    setPixel(bits, 0, 0, true);
    setPixel(bits, 9, 1, true);
    expect(bits[0]).toBe(0b1000_0000);
    expect(bits[WIDTH / 8 + 1]).toBe(0b0100_0000);
    expect(getPixel(bits, 9, 1)).toBe(true);
    expect(isBlank(bits)).toBe(false);
  });

  it('ignores pixels off the canvas', () => {
    const bits = blank();
    for (const [x, y] of [
      [-1, 0],
      [WIDTH, 0],
      [0, -1],
      [0, HEIGHT],
    ] as const) {
      setPixel(bits, x, y, true);
      expect(getPixel(bits, x, y)).toBe(false);
    }
    expect(isBlank(bits)).toBe(true);
  });

  it('round-trips through base64', () => {
    const bits = blank();
    setPixel(bits, 255, 159, true);
    expect(fromBase64(toBase64(bits))).toEqual(bits);
    expect(toBase64(bits)).toHaveLength(6828);
  });

  it('lists runs of ink row by row', () => {
    const bits = blank();
    paintStroke(bits, 'pencil', { x: 2, y: 3 }, { x: 5, y: 3 }, { ink: true, pattern: black });
    setPixel(bits, 7, 3, true);
    expect(inkRuns(bits)).toEqual([
      [2, 3, 4],
      [7, 3, 1],
    ]);
  });
});

describe('strokes', () => {
  it('joins distant points with no gaps', () => {
    const points = line({ x: 0, y: 0 }, { x: 30, y: 7 });
    expect(points[0]).toEqual({ x: 0, y: 0 });
    expect(points.at(-1)).toEqual({ x: 30, y: 7 });
    points.slice(1).forEach((point, i) => {
      const before = points[i]!;
      expect(Math.max(Math.abs(point.x - before.x), Math.abs(point.y - before.y))).toBe(1);
    });
  });

  it('lets the pencil draw paper, for a stroke that starts on ink', () => {
    const bits = blank();
    paintStroke(bits, 'pencil', { x: 0, y: 0 }, { x: 9, y: 0 }, { ink: true, pattern: black });
    paintStroke(bits, 'pencil', { x: 3, y: 0 }, { x: 5, y: 0 }, { ink: false, pattern: black });
    expect(inkRuns(bits)).toEqual([
      [0, 0, 3],
      [6, 0, 4],
    ]);
  });

  it('anchors patterns to the canvas, so strokes join seamlessly', () => {
    const bits = blank();
    paintStroke(bits, 'brush', { x: 20, y: 20 }, { x: 20, y: 20 }, { ink: true, pattern: grey });
    paintStroke(bits, 'brush', { x: 22, y: 20 }, { x: 22, y: 20 }, { ink: true, pattern: grey });
    for (let x = 18; x <= 24; x++) {
      expect(getPixel(bits, x, 20)).toBe(patternInk(grey, x, 20));
    }
  });

  it('rubs out an 8×8 square', () => {
    const bits = blank();
    fill(bits, 0, 0, black);
    paintStroke(bits, 'eraser', { x: 10, y: 10 }, { x: 10, y: 10 }, { ink: false, pattern: black });
    expect(getPixel(bits, 6, 6)).toBe(false);
    expect(getPixel(bits, 13, 13)).toBe(false);
    expect(getPixel(bits, 5, 6)).toBe(true);
    expect(getPixel(bits, 14, 13)).toBe(true);
  });
});

describe('the bucket', () => {
  it('stops at a one-pixel diagonal line', () => {
    const bits = blank();
    paintStroke(bits, 'pencil', { x: 0, y: 20 }, { x: 20, y: 0 }, { ink: true, pattern: black });
    fill(bits, 0, 0, black);
    expect(getPixel(bits, 5, 5)).toBe(true);
    expect(getPixel(bits, 30, 30)).toBe(false);
  });

  it('fills in a pattern, and finishes when nothing changes', () => {
    const bits = blank();
    fill(bits, 0, 0, black);
    fill(bits, 0, 0, black);
    expect(inkRuns(bits)).toHaveLength(HEIGHT);
    fill(bits, 0, 0, grey);
    expect(getPixel(bits, 0, 0)).toBe(patternInk(grey, 0, 0));
    expect(getPixel(bits, 1, 0)).toBe(patternInk(grey, 1, 0));
  });
});

it('tiles a pattern as a swatch', () => {
  expect(swatch(grey, 4, 2)).toEqual(['#.#.', '.#.#']);
});
```

- [ ] **Step 2: Run them to see them fail.** `npx nx test @msgr/frontend -- src/lib/paint`.

- [ ] **Step 3: Implement `paint.ts`** to the interface above. Notes: the index of (x, y) is `y * 32 + (x >> 3)` with mask `0x80 >> (x & 7)`; `line` is Bresenham; `fill` uses an explicit stack and a `visited` `Uint8Array(WIDTH * HEIGHT)`, so a pattern that leaves pixels in the start colour can't loop; `toBase64` is `btoa(String.fromCharCode(...bits))` and `fromBase64` is `Uint8Array.from(atob(text), (c) => c.charCodeAt(0))`.

- [ ] **Step 4: Run them to see them pass.**

---

### Task 6: Showing drawings

**Files:**

- Create: `apps/frontend/src/app/hooks/use-bitmap-canvas.ts`
- Create: `apps/frontend/src/app/components/chat/DrawingPicture.tsx` and `DrawingPicture.module.css`
- Modify: `apps/frontend/src/lib/theme.ts` (`applyTheme` dispatches `THEME_CHANGED` on `window`)
- Modify: `MessageBubble.tsx`, `MessageList.tsx` (select `drawing`; pass `onDrawOnIt`), `ChatListItem.tsx` (preview), `use-chat-feed.ts` (select and copy `drawing`), `use-alerts.ts` (`content: string | null`, body), `MessageInput.tsx` (select `drawing` in `SEND_MESSAGE`, so its cache write has every history field)

**Interfaces:**

- Consumes: `WIDTH`, `HEIGHT`, `inkRuns`, `fromBase64` (Task 5).
- Produces:

```ts
// lib/theme.ts
export const THEME_CHANGED = 'msgr:theme-changed';
// hooks/use-bitmap-canvas.ts
/** Paints `bits` on the returned canvas in its CSS `color` on its `background-color`, again whenever the theme changes. Call `repaint` after changing `bits` in place. */
export function useBitmapCanvas(bits: Uint8Array): { ref: React.RefObject<HTMLCanvasElement | null>; repaint: () => void };
// components/chat/DrawingPicture.tsx
export function DrawingPicture(props: { drawing: string; onDrawOnIt?: () => void }): JSX.Element;
// MessageBubble props: message.content: string | null; message.drawing: string | null; onDrawOnIt?: (drawing: string) => void
// MessageList props: onDrawOnIt?: (drawing: string) => void
```

- [ ] **Step 1: The hook.**

```ts
import { useCallback, useEffect, useRef } from 'react';
import { HEIGHT, WIDTH, inkRuns } from '../../lib/paint';
import { THEME_CHANGED } from '../../lib/theme';

export function useBitmapCanvas(bits: Uint8Array) {
  const ref = useRef<HTMLCanvasElement>(null);
  const repaint = useCallback(() => {
    const canvas = ref.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    // The canvas's own CSS colours: the theme's ink and paper, tints resolved.
    const { color, backgroundColor } = getComputedStyle(canvas);
    context.fillStyle = backgroundColor;
    context.fillRect(0, 0, WIDTH, HEIGHT);
    context.fillStyle = color;
    for (const [x, y, length] of inkRuns(bits)) context.fillRect(x, y, length, 1);
  }, [bits]);
  useEffect(() => {
    repaint();
    window.addEventListener(THEME_CHANGED, repaint);
    return () => window.removeEventListener(THEME_CHANGED, repaint);
  }, [repaint]);
  return { ref, repaint };
}
```

In `applyTheme`, after the classes change: `window.dispatchEvent(new Event(THEME_CHANGED));`.

- [ ] **Step 2: `DrawingPicture`.** It decodes once with `useMemo(() => fromBase64(drawing), [drawing])`. It renders `<canvas width={WIDTH} height={HEIGHT} role="img" aria-label="Drawing" className={styles.picture}>`, then, if given `onDrawOnIt`, an `ActionButton` reading "Draw on It". CSS:

```css
/* A little MacPaint document: ink on paper in a 1-pixel frame, at 2× (1× on a phone). */
.picture {
  display: block;
  width: 512px;
  max-width: 100%;
  height: auto;
  aspect-ratio: 8 / 5;
  color: var(--ink);
  background: var(--paper);
  box-shadow: 0 0 0 1px var(--ink);
  image-rendering: pixelated;

  @media (max-width: 760px) {
    width: 256px;
  }
}

.actions {
  margin-top: 4px;
}
```

- [ ] **Step 3: Wire the bubble and the data.**

  - `MessageBubble` renders `message.drawing != null ? <DrawingPicture drawing={message.drawing} onDrawOnIt={onDrawOnIt && (() => onDrawOnIt(message.drawing!))} /> : <span …>{message.content}</span>`; bind `drawing` to a local first, rather than using `!`.
  - `GET_CHAT_MESSAGES`, `SEND_MESSAGE` and the `messageReceived` subscription select `drawing`. The feed's history write copies `drawing`.
  - `ChatListItem` shows `latestMessage ? (latestMessage.content ?? 'Drawing') : 'No messages yet'`, with `content: string | null` in its props.
  - `use-alerts`: `content: string | null`, and `body: content ?? 'Sent a drawing.'`.

- [ ] **Step 4: Check it.** `npm run typecheck && npm run lint && npm run test`. All pass.

---

### Task 7: The paint window

**Files:**

- Create: `apps/frontend/src/app/components/chat/PaintDialog.tsx` and `PaintDialog.module.css`
- Modify: `apps/frontend/src/app/components/icons.ts` (16×16 `PENCIL`, `BRUSH`, `BUCKET`, `ERASER`, `UNDO`, `CLEAR`)
- Modify: `apps/frontend/src/app/components/MacDialog.tsx` and `.module.css` (a `wide` prop: `width: max-content; max-width: calc(100vw - 4ch)`)
- Modify: `ChatWindow.tsx` (opens the window), `MessageInput.tsx` (a "Draw…" button, `onDraw` prop)

**Interfaces:**

- Consumes: everything in Task 5; `useBitmapCanvas` (Task 6); `GET_CHAT_DATA`, `GET_CHAT_MESSAGES`, `withMessage`.
- Produces: `PaintDialog(props: { chatId: string; start?: string })`, opened with `useModals().open(PaintDialog, { chatId, start })`; `MessageInput` prop `onDraw: () => void`.

- [ ] **Step 1: The dialog's state and actions.**

```ts
const SEND_DRAWING = gql(`
  mutation SendDrawing($chatId: ID!, $drawing: String!) {
    sendDrawing(input: { chatId: $chatId, drawing: $drawing }) {
      id
      content
      drawing
      sender { id name }
      createdAt
    }
  }
`);
type Tool = Brush | 'bucket';
const UNDO_STEPS = 20;

// In the component:
const [bits] = useState(() => (start ? fromBase64(start) : blank()));
const { ref, repaint } = useBitmapCanvas(bits);
const [tool, setTool] = useState<Tool>('pencil');
const [pattern, setPattern] = useState(PATTERNS[0]!);
const [changed, setChanged] = useState(false);
const [empty, setEmpty] = useState(() => isBlank(bits));
const [confirming, setConfirming] = useState(false);
const history = useRef<Uint8Array[]>([]);
const stroke = useRef<{ last: Point; ink: boolean } | null>(null);

const drew = () => {
  repaint();
  setChanged(true);
  setEmpty(isBlank(bits));
};
const checkpoint = () => {
  history.current = [...history.current.slice(1 - UNDO_STEPS), bits.slice()];
};
const undo = () => {
  const before = history.current.pop();
  if (before) {
    bits.set(before);
    drew();
  }
};
const clear = () => {
  checkpoint();
  bits.fill(0);
  drew();
};
const cancel = () => (changed ? setConfirming(true) : close());
useHotkeys('Escape', () => (confirming ? setConfirming(false) : cancel()), { enableOnFormTags: true });
useHotkeys('meta+z, ctrl+z', undo, { preventDefault: true });
```

- [ ] **Step 2: Pointer handling on the canvas** (`touch-action: none`, `cursor: crosshair`):

```ts
const at = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
  const box = e.currentTarget.getBoundingClientRect();
  return {
    x: Math.floor(((e.clientX - box.left) / box.width) * WIDTH),
    y: Math.floor(((e.clientY - box.top) / box.height) * HEIGHT),
  };
};
onPointerDown: if (e.button !== 0) return; capture the pointer; checkpoint();
  bucket → fill(bits, x, y, pattern.rows); drew(); return.
  Otherwise ink = tool === 'pencil' ? !getPixel(bits, x, y) : true;
  paintStroke(bits, tool, point, point, …); stroke.current = { last: point, ink }; drew().
onPointerMove: if (!stroke.current) return; paintStroke from last to the point; last = point; drew().
onPointerUp / onPointerCancel: stroke.current = null.
```

- [ ] **Step 3: Layout.**

  - `<MacDialog title={`Drawing for ${chat title}`} modal wide>`, with the chat title from `GET_CHAT_DATA`. The window doesn't close on outside clicks.
  - Tools column: `<button type="button" aria-pressed>` wrapping `PixelIcon` with a label (Pencil, Brush, Paint Bucket, Eraser). Undo and Clear are plain buttons.
  - The canvas is 512×320 CSS pixels, 256×160 when narrow.
  - The pattern row: `<button aria-pressed aria-label={name}>` wrapping `PixelIcon bitmap={swatch(rows, 16, 12)}`.
  - Then either the buttons (**Cancel** and **Send**, which reads "Sending" while loading and is `isDisabled` while `empty`) or, when confirming, the question with **Keep Drawing** and **Discard**.
  - A send error shows as `<p role="alert">` above the buttons.
  - Pressed buttons invert (`--ink` background, `--paper` icon). Narrow: the tools become a row above the canvas.

- [ ] **Step 4: Sending.**

  - `useMutation(SEND_DRAWING, { update, onCompleted: () => close() })`, where `update` appends to `GET_CHAT_MESSAGES` with `withMessage`, as `MessageInput` does.
  - Call it as `sendDrawing({ variables: { chatId, drawing: toBase64(bits) } }).catch(() => undefined)`, since the error is shown from the hook's `error`.

- [ ] **Step 5: Open it.**

  - `ChatWindow`: `const { open } = useModals(); const draw = (start?: string) => open(PaintDialog, { chatId, start });`.
  - Pass `onDraw={() => draw()}` to `MessageInput` and `onDrawOnIt={draw}` to `MessageList`.
  - `MessageInput` renders `<Button theme="SECONDARY" type="button" onClick={onDraw}>Draw…</Button>` before Send.

- [ ] **Step 6: Check it in the browser.** `npm run dev`, then draw with each tool and pattern, undo, clear, send, Draw on It, cancel and discard, in light, dark and a tint, and at phone width. Screenshot it and look.

- [ ] **Step 7: `npm run typecheck && npm run lint && npm run test`.**

---

### Task 8: Browser tests, screenshot and docs

**Files:**

- Create: `apps/e2e/tests/drawing.spec.ts`
- Modify: `apps/e2e/screenshots/readme.spec.ts` (`paint.png`)
- Modify: `README.md`, `CONTEXT.md`, `CLAUDE.md` (`lib/` list; `Message` union and its CHECK), `docs/architecture.md` (step 1 names `sendDrawing`), `docs/manual-testing.md` (a drawing section)

- [ ] **Step 1: The e2e spec.** Test User and Bob share a direct chat in the seed, and neither signs in elsewhere in the suite more than once.

```ts
import { expect, test, type Page } from '@playwright/test';
import { anotherPerson, chatWindow, chatsWindow, signIn } from './support';

const paintWindow = (page: Page) => page.getByRole('dialog', { name: /^Drawing for / });

/** Drags across the canvas from one fraction of it to another. */
async function scribble(page: Page, from: [number, number], to: [number, number]) {
  const box = await paintWindow(page).locator('canvas').boundingBox();
  if (!box) throw new Error('No canvas');
  const point = ([x, y]: [number, number]) => [box.x + x * box.width, box.y + y * box.height] as const;
  await page.mouse.move(...point(from));
  await page.mouse.down();
  await page.mouse.move(...point(to), { steps: 12 });
  await page.mouse.up();
}

test('a drawing goes to Bob live, and comes back drawn on', async ({ page, browser }) => {
  const bob = await anotherPerson(browser);
  await page.goto('/login');
  await signIn(page, 'test@example.com');
  await bob.goto('/login');
  await signIn(bob, 'bob@example.com');
  await chatsWindow(page).getByText('Bob Smith', { exact: true }).click();
  await chatsWindow(bob).getByText('Test User', { exact: true }).click();

  await chatWindow(page, 'Bob Smith').getByRole('button', { name: 'Draw…' }).click();
  await expect(paintWindow(page)).toHaveAccessibleName('Drawing for Bob Smith');
  await scribble(page, [0.1, 0.2], [0.9, 0.8]);
  await paintWindow(page).getByRole('button', { name: 'Send' }).click();
  await expect(paintWindow(page)).toBeHidden();

  const bobsChat = chatWindow(bob, 'Test User');
  await expect(bobsChat.getByRole('img', { name: 'Drawing' })).toHaveCount(1);
  await expect(chatsWindow(bob).getByText('Drawing', { exact: true })).toBeVisible();

  await bobsChat.getByRole('button', { name: 'Draw on It' }).click();
  await paintWindow(bob).getByRole('button', { name: 'Brush' }).click();
  await paintWindow(bob).getByRole('button', { name: 'Bricks' }).click();
  await scribble(bob, [0.9, 0.1], [0.1, 0.9]);
  await paintWindow(bob).getByRole('button', { name: 'Send' }).click();

  await expect(chatWindow(page, 'Bob Smith').getByRole('img', { name: 'Drawing' })).toHaveCount(2);
});

test('undo brings back what Clear wiped, and Cancel asks before discarding', async ({ browser }) => {
  // Its own browser, so its sign-in is Charlie's second at most (sign-in.spec has one).
  const page = await anotherPerson(browser);
  await page.goto('/login');
  await signIn(page, 'charlie@example.com');
  await chatsWindow(page).getByText('Test User', { exact: true }).click();
  await chatWindow(page, 'Test User').getByRole('button', { name: 'Draw…' }).click();
  const send = paintWindow(page).getByRole('button', { name: 'Send' });

  await expect(send).toHaveCount(0); // a blank canvas can't be sent
  await scribble(page, [0.2, 0.5], [0.8, 0.5]);
  await expect(send).toBeVisible();
  await paintWindow(page).getByRole('button', { name: 'Clear' }).click();
  await expect(send).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(send).toBeVisible();

  await paintWindow(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByText('Discard this drawing?')).toBeVisible();
  await page.getByRole('button', { name: 'Keep Drawing' }).click();
  await expect(paintWindow(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Discard' }).click();
  await expect(paintWindow(page)).toBeHidden();
});
```

Add a theme check to the first test, after Bob receives the drawing: choose **View → Dark** in Bob's window, then read the picture canvas's top-left pixel with `canvas.evaluate` (`getContext('2d').getImageData(0, 0, 1, 1).data`). It must equal the canvas's computed `background-color`. Use the View menu's real item names (read `ThemeMenu.tsx`).

- [ ] **Step 2: Run it.** `npm run e2e`. All pass: the new spec and `sign-in.spec`.

- [ ] **Step 3: The screenshot.** Add a test to `readme.spec.ts`, before the tests that add messages: Test User opens Bob Smith's chat, presses Draw…, and draws a house with the mouse. The steps: the pencil outlines the walls and the roof; the bucket fills the walls with Bricks and the roof with Dark grey; the brush adds a sun. Capture `paint.png`. Run `npm run screenshots`, look at it, and add it to the README with a "What it does" bullet:

  > - **MacPaint drawings.** **Draw…** opens a paint window with a pencil, brush, paint bucket, eraser and eight patterns, and sends the picture to the chat. **Draw on It** sends one back with your additions.

- [ ] **Step 4: Docs.**

  - `CONTEXT.md`: **Message** becomes "Text or a drawing…"; add **Drawing**, as the spec words them.
  - `CLAUDE.md`: add `paint` to the `lib/` list. Under illegal states, say that `Message = TextMessage | DrawingMessage` and that exactly one of `content` and `drawing` is set (CHECK).
  - `docs/architecture.md`, step 1: "The composer calls `sendMessage` (or the paint window `sendDrawing`)…".
  - `docs/manual-testing.md`: a short drawing checklist, covering every tool, undo, clear, Draw on It, cancel and discard, dark mode, and a phone.

- [ ] **Step 5: Full check, commit, push, watch CI.**

```bash
npm run typecheck && npm run lint && npm run test && npm run e2e
git add -A && git commit -m "Send MacPaint drawings as messages, and draw on the ones you get"
git push origin main
```
