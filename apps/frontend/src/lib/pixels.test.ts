import { blank, setPixel } from '@msgr/bitmap';
import { describe, expect, it } from 'vitest';
import {
  bitmapOf,
  identicon,
  identiconCells,
  pictureImage,
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

  it("is drawn in the theme's ink and paper, tinted ones too", () => {
    const inks = { ink: 'oklch(0.18 0.1 142)', paper: 'oklch(0.97 0.02 142)' };
    const uri = identicon('chat-1', inks);
    const svg = decodeURIComponent(uri.replace('data:image/svg+xml,', ''));

    expect(svg).toContain('fill="oklch(0.97 0.02 142)"');
    expect(svg).toContain('fill="oklch(0.18 0.1 142)"');
    expect(svg).not.toContain('#000');
    expect(uri).not.toMatch(/[\s()'"]/);
  });
});

describe('bitmapOf', () => {
  it('turns packed bits, leftmost in the high bit, into rows', () => {
    expect(
      bitmapOf({
        width: 8,
        height: 2,
        bytes: Uint8Array.of(0b1000_0001, 0xff),
      })
    ).toEqual(['#......#', '########']);
    // Rows padded to whole bytes: 9 pixels take 2.
    expect(
      bitmapOf({ width: 9, height: 2, bytes: Uint8Array.of(0, 0x80, 0x80, 0) })
    ).toEqual(['........#', '#........']);
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

describe('pictureImage', () => {
  it('draws a picture black on white, at its own size, safe in a CSS url()', () => {
    const bits = blank(3, 2);
    setPixel(bits, 1, 1, true);

    const svg = decodeURIComponent(
      pictureImage(bits).replace('data:image/svg+xml,', '')
    );

    expect(svg).toContain('viewBox="0 0 3 2"');
    expect(svg).toContain('<rect width="3" height="2" fill="#fff"/>');
    expect(svg).toContain('d="M1 1h1v1h-1z" fill="#000"');
    expect(pictureImage(bits)).not.toMatch(/[()\s"']/);
  });

  it('draws in the colours it is given', () => {
    const bits = blank(1, 1);
    const svg = decodeURIComponent(
      pictureImage(bits, { ink: 'navy', paper: 'ivory' }).replace(
        'data:image/svg+xml,',
        ''
      )
    );
    expect(svg).toContain('fill="ivory"');
    expect(svg).toContain('fill="navy"');
  });
});
