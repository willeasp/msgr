import { describe, expect, it } from 'vitest';
import { visibleFrame, WHOLE } from './viewport';

describe('visibleFrame', () => {
  it('is the whole page with no keyboard', () => {
    expect(visibleFrame(844, { height: 844, offsetTop: 0, scale: 1 })).toBe(
      WHOLE
    );
  });

  it('stops above a keyboard laid over the page', () => {
    expect(visibleFrame(844, { height: 508, offsetTop: 0, scale: 1 })).toEqual({
      top: 0,
      inset: 336,
    });
  });

  it('follows the page as iOS slides it up under the keyboard', () => {
    expect(
      visibleFrame(844, { height: 508, offsetTop: 120.4, scale: 1 })
    ).toEqual({ top: 120, inset: 216 });
  });

  it('leaves a pinch-zoomed page whole, so zooming still magnifies', () => {
    expect(visibleFrame(844, { height: 422, offsetTop: 200, scale: 2 })).toBe(
      WHOLE
    );
  });

  it('never goes negative, whatever a browser reports mid-animation', () => {
    expect(visibleFrame(844, { height: 900, offsetTop: -3, scale: 1 })).toBe(
      WHOLE
    );
  });
});
