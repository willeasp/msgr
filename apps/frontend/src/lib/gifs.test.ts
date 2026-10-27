import { describe, expect, it } from 'vitest';
import { makingLabel, withNextPage } from './gifs';

const gifs = (...ids: string[]) => ids.map((id) => ({ id }));

describe('withNextPage', () => {
  it('adds the next page after what’s held, and takes its cursor', () => {
    expect(
      withNextPage(
        { gifs: gifs('a', 'b'), next: '2' },
        { gifs: gifs('c', 'd'), next: '4' }
      )
    ).toEqual({ gifs: gifs('a', 'b', 'c', 'd'), next: '4' });
  });

  it('shows a GIF on both pages once, where it first was', () => {
    expect(
      withNextPage(
        { gifs: gifs('a', 'b'), next: '2' },
        { gifs: gifs('b', 'c'), next: null }
      )
    ).toEqual({ gifs: gifs('a', 'b', 'c'), next: null });
  });
});

describe('makingLabel', () => {
  it('says what making the movie is doing, frame by frame once it knows how many', () => {
    expect(makingLabel({ stage: 'Fetching', done: 0, of: 0 })).toBe(
      'Fetching the GIF…'
    );
    expect(makingLabel({ stage: 'Reading', done: 0, of: 0 })).toBe('Reading…');
    expect(makingLabel({ stage: 'Reading', done: 3, of: 24 })).toBe(
      'Reading frame 3 of 24…'
    );
    expect(makingLabel({ stage: 'Dithering', done: 24, of: 24 })).toBe(
      'Dithering frame 24 of 24…'
    );
  });
});
