import { describe, expect, it } from 'vitest';
import {
  bitmapOf,
  identicon,
  identiconCells,
  pixelPath,
  svgMask,
} from './pixels';

describe('pixelPath', () => {
  it('draws one rectangle per horizontal run of ink', () => {
    expect(pixelPath(['#.##', '....', '.#..'])).toBe(
      'M0 0h1v1h-1zM2 0h2v1h-2zM1 2h1v1h-1z'
    );
  });

  it('draws nothing for a blank bitmap', () => {
    expect(pixelPath(['...', '...'])).toBe('');
  });
});

describe('identiconCells', () => {
  it('is the same for the same seed and differs between seeds', () => {
    expect(identiconCells('chat-1')).toEqual(identiconCells('chat-1'));
    expect(identiconCells('chat-1')).not.toEqual(identiconCells('chat-2'));
  });

  it('is a 5×5 grid, mirrored left to right, with some ink', () => {
    for (const seed of ['a', 'b', 'cmutyy69d0005gxc1847lgqqq', '']) {
      const cells = identiconCells(seed);
      expect(cells).toHaveLength(5);
      for (const row of cells) {
        expect(row).toHaveLength(5);
        expect(row).toEqual([...row].reverse());
      }
      expect(cells.flat()).toContain(true);
    }
  });
});

describe('identicon', () => {
  it('is an SVG data URI', () => {
    expect(identicon('chat-1')).toMatch(/^data:image\/svg\+xml,/);
  });

  it('survives an unquoted CSS url(), as Avatar uses it', () => {
    expect(identicon('chat-1')).not.toMatch(/[\s()'"]/);
  });
});

describe('bitmapOf', () => {
  it('turns packed bits, leftmost in the high bit, into rows', () => {
    expect(bitmapOf(new Uint8Array([0b1000_0001, 0xff]), 8)).toEqual([
      '#......#',
      '########',
    ]);
  });
});

describe('svgMask', () => {
  it('draws a bitmap as an SVG mask for CSS, crisp at any size', () => {
    const mask = svgMask(['#.', '.#']);
    expect(mask.startsWith('url("data:image/svg+xml,')).toBe(true);
    const svg = decodeURIComponent(mask.slice(24, -2));
    expect(svg).toContain('viewBox="0 0 2 2"');
    expect(svg).toContain('shape-rendering="crispEdges"');
    expect(svg).toContain('M0 0h1v1h-1z');
  });
});
