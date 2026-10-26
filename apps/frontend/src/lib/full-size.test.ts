import { describe, expect, it } from 'vitest';
import { fullSize } from './full-size';

const photo = { width: 320, height: 212 };

describe('fullSize', () => {
  it('fills a desktop in whole screen pixels per pixel, so the dither stays even', () => {
    // 3.3 times fits; 3 is whole at either density.
    expect(fullSize(photo, { width: 1232, height: 700 }, 2)).toEqual({
      width: 960,
      height: 636,
    });
    expect(fullSize(photo, { width: 1232, height: 700 }, 1)).toEqual({
      width: 960,
      height: 636,
    });
    // 2.6 fits: at twice the density, 2.5 is whole (5 screen pixels each).
    expect(fullSize(photo, { width: 832, height: 600 }, 2)).toEqual({
      width: 800,
      height: 530,
    });
  });

  it('keeps whole pixels while they lose a tenth at most, and no more', () => {
    const square = { width: 10, height: 10 };
    // 2.2 fits: 2 loses a eleventh.
    expect(fullSize(square, { width: 22, height: 99 }, 1).width).toBe(20);
    // 2.25 fits: 2 would lose a ninth.
    expect(fullSize(square, { width: 22.5, height: 99 }, 1).width).toBe(22.5);
  });

  it('fills a phone’s width exactly when whole pixels would leave it hardly bigger', () => {
    // 1.22 fits; whole pixels at 3× would be 1, no bigger than in the chat.
    const shown = fullSize(photo, { width: 390, height: 824 }, 3);
    expect(shown.width).toBe(390);
    expect(shown.height).toBeCloseTo(258.4, 1);
  });

  it('fits by the side that runs out first', () => {
    const tall = { width: 180, height: 320 };
    // 2.17 across, 2.58 down: across runs out; 2 is whole and close enough.
    expect(fullSize(tall, { width: 390, height: 824 }, 3)).toEqual({
      width: 360,
      height: 640,
    });
    expect(fullSize(photo, { width: 2000, height: 424 }, 1)).toEqual({
      width: 640,
      height: 424,
    });
  });

  it('shrinks what doesn’t fit, and shows nothing in no room', () => {
    expect(fullSize(photo, { width: 160, height: 1000 }, 1)).toEqual({
      width: 160,
      height: 106,
    });
    expect(fullSize(photo, { width: 0, height: 500 }, 2)).toEqual({
      width: 0,
      height: 0,
    });
    expect(fullSize(photo, { width: -20, height: 500 }, 2)).toEqual({
      width: 0,
      height: 0,
    });
  });
});
