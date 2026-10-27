import { describe, expect, it } from 'vitest';
import { makingLabel } from './gifs';

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
