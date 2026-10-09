import { describe, expect, it } from 'vitest';
import { identicon, identiconCells, pixelPath } from './pixels';

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
