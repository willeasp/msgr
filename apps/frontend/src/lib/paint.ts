import type { Bitmap } from './pixels';

/**
 * The paint window's canvas, 1 bit a pixel, in the API's `Drawing` layout:
 * rows top to bottom, 8 pixels a byte with the leftmost in the high bit, 1 for
 * ink. Tools change it in place; callers copy it for undo.
 */
export const WIDTH = 256;
export const HEIGHT = 160;
const ROW_BYTES = WIDTH / 8;

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** 8 rows of 8 pixels, one byte a row, the leftmost in the high bit. */
export type Pattern = readonly number[];

/** MacPaint's, or near enough. */
export const PATTERNS = [
  { name: 'Black', rows: [0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff] },
  { name: 'Dark grey', rows: [0xdd, 0x77, 0xdd, 0x77, 0xdd, 0x77, 0xdd, 0x77] },
  { name: 'Grey', rows: [0xaa, 0x55, 0xaa, 0x55, 0xaa, 0x55, 0xaa, 0x55] },
  {
    name: 'Light grey',
    rows: [0x88, 0x22, 0x88, 0x22, 0x88, 0x22, 0x88, 0x22],
  },
  { name: 'White', rows: [0, 0, 0, 0, 0, 0, 0, 0] },
  { name: 'Horizontal lines', rows: [0xff, 0, 0, 0, 0xff, 0, 0, 0] },
  { name: 'Diagonal lines', rows: [1, 2, 4, 8, 16, 32, 64, 128] },
  { name: 'Bricks', rows: [0xff, 0x80, 0x80, 0x80, 0xff, 0x08, 0x08, 0x08] },
] as const satisfies readonly { name: string; rows: Pattern }[];

export type Brush = 'pencil' | 'brush' | 'eraser';

export const blank = (): Uint8Array => new Uint8Array(ROW_BYTES * HEIGHT);

const onCanvas = (x: number, y: number) =>
  x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT;

export function getPixel(bits: Uint8Array, x: number, y: number): boolean {
  if (!onCanvas(x, y)) return false;
  return ((bits[y * ROW_BYTES + (x >> 3)] ?? 0) & (0x80 >> (x & 7))) !== 0;
}

/** Off the canvas, does nothing. */
export function setPixel(
  bits: Uint8Array,
  x: number,
  y: number,
  ink: boolean
): void {
  if (!onCanvas(x, y)) return;
  const i = y * ROW_BYTES + (x >> 3);
  const mask = 0x80 >> (x & 7);
  const byte = bits[i] ?? 0;
  bits[i] = ink ? byte | mask : byte & ~mask;
}

export const isBlank = (bits: Uint8Array): boolean =>
  bits.every((byte) => byte === 0);

/** Patterns are anchored to the canvas, so overlapping strokes line up. */
export const patternInk = (pattern: Pattern, x: number, y: number): boolean =>
  (((pattern[y & 7] ?? 0) >> (7 - (x & 7))) & 1) === 1;

/** Every point from `from` to `to`, both included, with no gaps (Bresenham). */
export function line(from: Point, to: Point): Point[] {
  const points: Point[] = [];
  const dx = Math.abs(to.x - from.x);
  const dy = -Math.abs(to.y - from.y);
  const sx = from.x < to.x ? 1 : -1;
  const sy = from.y < to.y ? 1 : -1;
  let error = dx + dy;
  let { x, y } = from;
  for (;;) {
    points.push({ x, y });
    if (x === to.x && y === to.y) return points;
    const twice = 2 * error;
    if (twice >= dy) {
      error += dy;
      x += sx;
    }
    if (twice <= dx) {
      error += dx;
      y += sy;
    }
  }
}

// A round 5×5 dab: the square without its corners.
const DAB = Array.from({ length: 25 }, (_, i) => ({
  dx: (i % 5) - 2,
  dy: Math.floor(i / 5) - 2,
})).filter(({ dx, dy }) => Math.abs(dx) + Math.abs(dy) < 4);

/** One stretch of a stroke: the brush's stamp at every point along it. */
export function paintStroke(
  bits: Uint8Array,
  brush: Brush,
  from: Point,
  to: Point,
  { ink, pattern }: { readonly ink: boolean; readonly pattern: Pattern }
): void {
  for (const { x, y } of line(from, to)) {
    switch (brush) {
      case 'pencil':
        setPixel(bits, x, y, ink);
        break;
      case 'brush':
        for (const { dx, dy } of DAB) {
          setPixel(bits, x + dx, y + dy, patternInk(pattern, x + dx, y + dy));
        }
        break;
      case 'eraser':
        for (let dy = -4; dy < 4; dy++) {
          for (let dx = -4; dx < 4; dx++) setPixel(bits, x + dx, y + dy, false);
        }
        break;
    }
  }
}

/**
 * The paint bucket: the 4-connected area of the colour at (x, y), painted in
 * `pattern`. A one-pixel diagonal line holds it in, as MacPaint's did.
 */
export function fill(
  bits: Uint8Array,
  x: number,
  y: number,
  pattern: Pattern
): void {
  if (!onCanvas(x, y)) return;
  const target = getPixel(bits, x, y);
  // Painted pixels may keep the target colour, so track visits apart.
  const seen = new Uint8Array(WIDTH * HEIGHT);
  const stack = [y * WIDTH + x];
  for (let i = stack.pop(); i !== undefined; i = stack.pop()) {
    const px = i % WIDTH;
    const py = Math.floor(i / WIDTH);
    if (seen[i] || getPixel(bits, px, py) !== target) continue;
    seen[i] = 1;
    setPixel(bits, px, py, patternInk(pattern, px, py));
    if (px > 0) stack.push(i - 1);
    if (px < WIDTH - 1) stack.push(i + 1);
    if (py > 0) stack.push(i - WIDTH);
    if (py < HEIGHT - 1) stack.push(i + WIDTH);
  }
}

/** Each row's runs of ink, as [x, y, length], for drawing with fillRect. */
export function inkRuns(bits: Uint8Array): [number, number, number][] {
  const runs: [number, number, number][] = [];
  for (let y = 0; y < HEIGHT; y++) {
    let start = -1;
    for (let x = 0; x <= WIDTH; x++) {
      const ink = getPixel(bits, x, y);
      if (ink && start < 0) start = x;
      if (!ink && start >= 0) {
        runs.push([start, y, x - start]);
        start = -1;
      }
    }
  }
  return runs;
}

export const toBase64 = (bits: Uint8Array): string =>
  btoa(String.fromCharCode(...bits));

export const fromBase64 = (text: string): Uint8Array =>
  Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

/** A pattern tiled to `width`×`height`, for a swatch drawn by PixelIcon. */
export const swatch = (
  pattern: Pattern,
  width: number,
  height: number
): Bitmap =>
  Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) =>
      patternInk(pattern, x, y) ? '#' : '.'
    ).join('')
  );
