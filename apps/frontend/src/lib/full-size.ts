/*
 * A picture or movie shown full screen (PictureWindow): as large as fits,
 * its pixels square and crisp.
 */

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** How much smaller than what fits a picture may be drawn to keep its pixels whole. */
const WHOLE_PIXELS_MAY_LOSE = 0.1;

/**
 * The size, in CSS pixels, to show something `size` big in `room`: as large
 * as fits. Each of its pixels takes a whole number of the screen's when that
 * loses little, so dithering stays even; otherwise exactly what fits, as on
 * a phone, where whole pixels would leave a picture hardly bigger than in
 * the chat.
 */
export function fullSize(size: Size, room: Size, pixelRatio: number): Size {
  const fit = Math.max(
    0,
    Math.min(room.width / size.width, room.height / size.height)
  );
  const whole = Math.floor(fit * pixelRatio) / pixelRatio;
  const scale = whole >= fit * (1 - WHOLE_PIXELS_MAY_LOSE) ? whole : fit;
  return { width: size.width * scale, height: size.height * scale };
}
