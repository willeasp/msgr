import { describe, expect, it } from 'vitest';
import { firstPart, moveTo, setEnd, setStart } from './trim';

describe('the part of a video made a movie', () => {
  it('starts at the beginning, as long as allowed', () => {
    expect(firstPart(60)).toEqual({ start: 0, end: 6 });
    expect(firstPart(2.5)).toEqual({ start: 0, end: 2.5 });
  });

  it('moves whole, staying inside the video', () => {
    const part = { start: 0, end: 6 };
    expect(moveTo(part, 10, 60)).toEqual({ start: 10, end: 16 });
    expect(moveTo(part, -3, 60)).toEqual({ start: 0, end: 6 });
    expect(moveTo(part, 58, 60)).toEqual({ start: 54, end: 60 });
  });

  it('stretches from either end, at most 6 seconds and at least half of one', () => {
    const part = { start: 10, end: 14 };
    expect(setStart(part, 9)).toEqual({ start: 9, end: 14 });
    expect(setStart(part, 2)).toEqual({ start: 8, end: 14 });
    expect(setStart(part, 13.9)).toEqual({ start: 13.5, end: 14 });
    expect(setEnd(part, 30, 60)).toEqual({ start: 10, end: 16 });
    expect(setEnd(part, 10, 60)).toEqual({ start: 10, end: 10.5 });
    expect(setEnd({ start: 57, end: 59 }, 70, 60)).toEqual({
      start: 57,
      end: 60,
    });
  });

  it("takes another longest, as a sound's minute", () => {
    expect(firstPart(600, 60)).toEqual({ start: 0, end: 60 });
    expect(setStart({ start: 100, end: 130 }, 10, 60)).toEqual({
      start: 70,
      end: 130,
    });
    expect(setEnd({ start: 100, end: 130 }, 400, 600, 60)).toEqual({
      start: 100,
      end: 160,
    });
  });
});
