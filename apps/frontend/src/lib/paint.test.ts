import { describe, expect, it } from 'vitest';
import {
  HEIGHT,
  PATTERNS,
  WIDTH,
  blank,
  fill,
  fromBase64,
  getPixel,
  inkRuns,
  isBlank,
  line,
  paintStroke,
  patternInk,
  setPixel,
  swatch,
  toBase64,
  type Pattern,
} from './paint';

const pattern = (name: string): Pattern => {
  const found = PATTERNS.find((p) => p.name === name);
  if (!found) throw new Error(`No pattern called ${name}`);
  return found.rows;
};
const black = pattern('Black');
const grey = pattern('Grey');

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
    paintStroke(
      bits,
      'pencil',
      { x: 2, y: 3 },
      { x: 5, y: 3 },
      {
        ink: true,
        pattern: black,
      }
    );
    setPixel(bits, 7, 3, true);
    setPixel(bits, 255, 4, true);
    expect(inkRuns(bits)).toEqual([
      [2, 3, 4],
      [7, 3, 1],
      [255, 4, 1],
    ]);
  });
});

describe('strokes', () => {
  it('joins distant points with no gaps', () => {
    const points = line({ x: 0, y: 0 }, { x: 30, y: 7 });
    expect(points[0]).toEqual({ x: 0, y: 0 });
    expect(points.at(-1)).toEqual({ x: 30, y: 7 });
    points.slice(1).forEach((point, i) => {
      const before = points[i];
      if (!before) throw new Error('Missing point');
      const step = Math.max(
        Math.abs(point.x - before.x),
        Math.abs(point.y - before.y)
      );
      expect(step).toBe(1);
    });
  });

  it('lets the pencil draw paper, for a stroke that starts on ink', () => {
    const bits = blank();
    paintStroke(
      bits,
      'pencil',
      { x: 0, y: 0 },
      { x: 9, y: 0 },
      {
        ink: true,
        pattern: black,
      }
    );
    paintStroke(
      bits,
      'pencil',
      { x: 3, y: 0 },
      { x: 5, y: 0 },
      {
        ink: false,
        pattern: black,
      }
    );
    expect(inkRuns(bits)).toEqual([
      [0, 0, 3],
      [6, 0, 4],
    ]);
  });

  it('anchors patterns to the canvas, so strokes join seamlessly', () => {
    const bits = blank();
    for (const x of [20, 22]) {
      paintStroke(
        bits,
        'brush',
        { x, y: 20 },
        { x, y: 20 },
        {
          ink: true,
          pattern: grey,
        }
      );
    }
    for (let x = 18; x <= 24; x++) {
      expect(getPixel(bits, x, 20)).toBe(patternInk(grey, x, 20));
    }
  });

  it('brushes a round dab, without its corners', () => {
    const bits = blank();
    paintStroke(
      bits,
      'brush',
      { x: 10, y: 10 },
      { x: 10, y: 10 },
      {
        ink: true,
        pattern: black,
      }
    );
    expect(getPixel(bits, 8, 9)).toBe(true);
    expect(getPixel(bits, 12, 11)).toBe(true);
    expect(getPixel(bits, 8, 8)).toBe(false);
    expect(getPixel(bits, 13, 10)).toBe(false);
  });

  it('rubs out an 8×8 square', () => {
    const bits = blank();
    fill(bits, 0, 0, black);
    paintStroke(
      bits,
      'eraser',
      { x: 10, y: 10 },
      { x: 10, y: 10 },
      {
        ink: false,
        pattern: black,
      }
    );
    expect(getPixel(bits, 6, 6)).toBe(false);
    expect(getPixel(bits, 13, 13)).toBe(false);
    expect(getPixel(bits, 5, 6)).toBe(true);
    expect(getPixel(bits, 14, 13)).toBe(true);
  });
});

describe('the bucket', () => {
  it('stops at a one-pixel diagonal line', () => {
    const bits = blank();
    paintStroke(
      bits,
      'pencil',
      { x: 0, y: 20 },
      { x: 20, y: 0 },
      {
        ink: true,
        pattern: black,
      }
    );
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
    expect(getPixel(bits, 0, 0)).not.toBe(getPixel(bits, 1, 0));
  });
});

it('tiles a pattern as a swatch', () => {
  expect(swatch(grey, 4, 2)).toEqual(['#.#.', '.#.#']);
});

it('has the eight MacPaint patterns', () => {
  expect(PATTERNS.map(({ name }) => name)).toEqual([
    'Black',
    'Dark grey',
    'Grey',
    'Light grey',
    'White',
    'Horizontal lines',
    'Diagonal lines',
    'Bricks',
  ]);
});
