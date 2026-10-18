import { MAX_FRAMES, MOVIE_FPS } from '@msgr/bitmap';

/** The longest part of a video a movie can be made of, in seconds. */
export const LONGEST = MAX_FRAMES / MOVIE_FPS;
/** The shortest, so a part can't shrink to nothing. */
export const SHORTEST = 0.5;

/** A stretch of a video, in seconds from its start. */
export interface Part {
  readonly start: number;
  readonly end: number;
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** Where choosing starts: from the beginning, as long as allowed. */
export const firstPart = (duration: number): Part => ({
  start: 0,
  end: Math.min(LONGEST, duration),
});

/** The part moved whole to start at `start`, inside the video. */
export function moveTo(part: Part, start: number, duration: number): Part {
  const length = part.end - part.start;
  const from = clamp(start, 0, duration - length);
  return { start: from, end: from + length };
}

/** The part with its start dragged to `start`; its end stays. */
export const setStart = (part: Part, start: number): Part => ({
  start: clamp(start, Math.max(0, part.end - LONGEST), part.end - SHORTEST),
  end: part.end,
});

/** The part with its end dragged to `end`; its start stays. */
export const setEnd = (part: Part, end: number, duration: number): Part => ({
  start: part.start,
  end: clamp(
    end,
    part.start + SHORTEST,
    Math.min(duration, part.start + LONGEST)
  ),
});
