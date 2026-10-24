import { useEffect, useRef, type CSSProperties, type RefObject } from 'react';
import type { Bits } from '@msgr/media';
import { fillPixels, pixelOf } from '../../lib/pixels';
import { rgbaOf, THEME_CHANGED } from '../browser/theme';

/** A canvas's size for CSS, which scales its pixels (2× in chats, 1× on phones). */
export const pixelSize = ({ width, height }: Pick<Bits, 'width' | 'height'>) =>
  ({ '--width': width, '--height': height } as CSSProperties);

// What each canvas paints with: its CSS `color` on its `background-color`
// (the theme's ink and paper), as pixels, read again once the theme changes.
let theme = 0;
window.addEventListener(THEME_CHANGED, () => {
  theme += 1;
});
interface Paint {
  readonly theme: number;
  readonly ink: number;
  readonly paper: number;
  image: ImageData | null;
  pixels: Uint32Array | null;
}
const paints = new WeakMap<HTMLCanvasElement, Paint>();

function paintOf(canvas: HTMLCanvasElement): Paint {
  const known = paints.get(canvas);
  if (known?.theme === theme) return known;
  const { color, backgroundColor } = getComputedStyle(canvas);
  const paint: Paint = {
    theme,
    ink: pixelOf(rgbaOf(color) ?? [0, 0, 0, 255]),
    paper: pixelOf(rgbaOf(backgroundColor) ?? [255, 255, 255, 255]),
    image: known?.image ?? null,
    pixels: known?.pixels ?? null,
  };
  paints.set(canvas, paint);
  return paint;
}

/**
 * Paints `bits` on `canvas`, as large as it, in the canvas's own ink and
 * paper: one pass over the pixels into the ImageData the canvas keeps, and
 * one putImageData, however busy the picture.
 */
export function paintBits(canvas: HTMLCanvasElement, bits: Bits): void {
  const context = canvas.getContext('2d');
  if (!context) return;
  const paint = paintOf(canvas);
  if (
    !paint.image ||
    paint.image.width !== bits.width ||
    paint.image.height !== bits.height
  ) {
    paint.image = context.createImageData(bits.width, bits.height);
    paint.pixels = new Uint32Array(paint.image.data.buffer);
  }
  fillPixels(paint.pixels ?? new Uint32Array(), bits, paint.ink, paint.paper);
  context.putImageData(paint.image, 0, 0);
}

/**
 * Paints `bits` on the returned canvas (or `canvas`, given), and again
 * whenever the theme changes. Call `repaint` after changing `bits` in place.
 */
export function useBitmapCanvas(
  bits: Bits,
  canvas?: RefObject<HTMLCanvasElement | null>
) {
  const own = useRef<HTMLCanvasElement>(null);
  const ref = canvas ?? own;

  useEffect(() => {
    const repaint = () => {
      if (ref.current) paintBits(ref.current, bits);
    };
    repaint();
    window.addEventListener(THEME_CHANGED, repaint);
    return () => window.removeEventListener(THEME_CHANGED, repaint);
  }, [bits, ref]);

  return {
    ref,
    repaint: () => {
      if (ref.current) paintBits(ref.current, bits);
    },
  };
}
