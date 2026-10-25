import { blank, frameOf, getPixel, setPixel } from '@msgr/media';
import { describe, expect, it } from 'vitest';
import { madeOf } from './attachment';
import { noDrawing } from './movie';

describe('madeOf', () => {
  const movie = { width: 8, height: 1, count: 2, bytes: new Uint8Array(2) };

  it('sends a picture or a sound as it is, and nothing for none', () => {
    const bits = blank(8, 1);
    const codes = { frames: 2, bytes: new Uint8Array(4) } as never;

    expect(madeOf(null)).toBeNull();
    expect(madeOf({ kind: 'picture', bits })).toEqual({
      kind: 'picture',
      bits,
    });
    expect(madeOf({ kind: 'sound', codes })).toEqual({ kind: 'sound', codes });
  });

  it('draws what’s drawn over a movie into every frame, and leaves one with nothing drawn as it is', () => {
    const drawing = noDrawing(8, 1);
    setPixel(drawing.ink, 3, 0, true);
    setPixel(drawing.mask, 3, 0, true);

    const made = madeOf({ kind: 'movie', movie, drawing });
    if (made?.kind !== 'movie') throw new Error('Not a movie');
    expect([0, 1].map((f) => getPixel(frameOf(made.frames, f), 3, 0))).toEqual([
      true,
      true,
    ]);
    expect(getPixel(frameOf(movie, 0), 3, 0)).toBe(false);
    expect(madeOf({ kind: 'movie', movie, drawing: null })).toEqual({
      kind: 'movie',
      frames: movie,
    });
  });
});
