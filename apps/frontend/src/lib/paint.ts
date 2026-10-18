import { blank, getPixel, setPixel, type Bits } from '@msgr/bitmap';
import type { Bitmap } from './pixels';

/*
 * The paint window's tools, on a picture of any size in the shared `Bits`
 * layout. They change it in place; callers copy its bytes for undo.
 */

/** A new drawing's canvas: MacPaint's proportions, at half its size. */
export const newDrawing = (): Bits => blank(256, 160);

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

/** The pixels the brush's stamp covers at (x, y). */
function stamp(brush: Brush, x: number, y: number): Point[] {
  switch (brush) {
    case 'pencil':
      return [{ x, y }];
    case 'brush':
      return DAB.map(({ dx, dy }) => ({ x: x + dx, y: y + dy }));
    case 'eraser': {
      const square: Point[] = [];
      for (let dy = -4; dy < 4; dy++) {
        for (let dx = -4; dx < 4; dx++) square.push({ x: x + dx, y: y + dy });
      }
      return square;
    }
  }
}

/** One stretch of a stroke: the brush's stamp at every point along it. */
export function paintStroke(
  bits: Bits,
  brush: Brush,
  from: Point,
  to: Point,
  { ink, pattern }: { readonly ink: boolean; readonly pattern: Pattern }
): void {
  for (const point of line(from, to)) {
    for (const { x, y } of stamp(brush, point.x, point.y)) {
      const value =
        brush === 'pencil'
          ? ink
          : brush === 'brush' && patternInk(pattern, x, y);
      setPixel(bits, x, y, value);
    }
  }
}

/**
 * Inks in `mask` every pixel the same stroke would paint: over a movie, where
 * something was drawn, ink or paper.
 */
export function coverStroke(
  mask: Bits,
  brush: Brush,
  from: Point,
  to: Point
): void {
  for (const point of line(from, to)) {
    for (const { x, y } of stamp(brush, point.x, point.y)) {
      setPixel(mask, x, y, true);
    }
  }
}

/**
 * The paint bucket: the 4-connected area of the colour at (x, y), painted in
 * `pattern`. A one-pixel diagonal line holds it in, as MacPaint's did.
 */
export function fill(bits: Bits, x: number, y: number, pattern: Pattern): void {
  const { width, height } = bits;
  if (x < 0 || x >= width || y < 0 || y >= height) return;
  const target = getPixel(bits, x, y);
  // Painted pixels may keep the target colour, so track visits apart.
  const seen = new Uint8Array(width * height);
  const stack = [y * width + x];
  for (let i = stack.pop(); i !== undefined; i = stack.pop()) {
    const px = i % width;
    const py = Math.floor(i / width);
    if (seen[i] || getPixel(bits, px, py) !== target) continue;
    seen[i] = 1;
    setPixel(bits, px, py, patternInk(pattern, px, py));
    if (px > 0) stack.push(i - 1);
    if (px < width - 1) stack.push(i + 1);
    if (py > 0) stack.push(i - width);
    if (py < height - 1) stack.push(i + width);
  }
}

/** Each row's runs of ink, as [x, y, length], for drawing with fillRect. */
export function inkRuns(bits: Bits): [number, number, number][] {
  const runs: [number, number, number][] = [];
  for (let y = 0; y < bits.height; y++) {
    let start = -1;
    for (let x = 0; x <= bits.width; x++) {
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
