import { describe, expect, it } from 'vitest';
import { blank, getPixel, setPixel } from '@msgr/bitmap';
import {
  PATTERNS,
  fill,
  inkRuns,
  line,
  newDrawing,
  paintStroke,
  patternInk,
  swatch,
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
  it('starts a drawing blank at 256×160', () => {
    expect(newDrawing()).toMatchObject({ width: 256, height: 160 });
    expect(inkRuns(newDrawing())).toEqual([]);
  });

  it('paints a picture of any size, up to its edges', () => {
    const bits = blank(13, 7);
    fill(bits, 0, 0, black);
    expect(inkRuns(bits)).toEqual(
      Array.from({ length: 7 }, (_, y) => [0, y, 13])
    );
    paintStroke(
      bits,
      'eraser',
      { x: 12, y: 6 },
      { x: 12, y: 6 },
      { ink: false, pattern: black }
    );
    expect(getPixel(bits, 12, 6)).toBe(false);
    expect(getPixel(bits, 7, 1)).toBe(true);
  });

  it('lists runs of ink row by row', () => {
    const bits = newDrawing();
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
    const bits = newDrawing();
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
    const bits = newDrawing();
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
    const bits = newDrawing();
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
    const bits = newDrawing();
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
    const bits = newDrawing();
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
    const bits = newDrawing();
    fill(bits, 0, 0, black);
    fill(bits, 0, 0, black);
    expect(inkRuns(bits)).toHaveLength(160);
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
