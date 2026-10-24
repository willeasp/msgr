import { useEffect, useRef, type CSSProperties, type RefObject } from 'react';
import type { Bits } from '@msgr/media';
import { fillPixels, pixelOf } from '../../lib/pixels';
import { rgbaOf, THEME_CHANGED, themeVersion } from '../browser/theme';

/** A canvas's size for CSS, which scales its pixels (2× in chats, 1× on phones). */
export const pixelSize = ({ width, height }: Pick<Bits, 'width' | 'height'>) =>
  ({ '--width': width, '--height': height } as CSSProperties);

// What each canvas paints with: its CSS `color` on its `background-color`
// (the theme's ink and paper), as pixels, read again once the theme changes;
// and the ImageData it paints through, kept while its size holds.
interface Paint {
  readonly theme: number;
  readonly ink: number;
  readonly paper: number;
  image?: { readonly data: ImageData; readonly pixels: Uint32Array };
}
const paints = new WeakMap<HTMLCanvasElement, Paint>();

function paintOf(canvas: HTMLCanvasElement): Paint {
  const known = paints.get(canvas);
  if (known?.theme === themeVersion()) return known;
  const { color, backgroundColor } = getComputedStyle(canvas);
  const paint: Paint = {
    theme: themeVersion(),
    ink: pixelOf(rgbaOf(color) ?? [0, 0, 0, 255]),
    // A canvas with no paper of its own shows what's behind it.
    paper: pixelOf(rgbaOf(backgroundColor) ?? [0, 0, 0, 0]),
    image: known?.image,
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
  let image = paint.image;
  if (image?.data.width !== bits.width || image.data.height !== bits.height) {
    const data = context.createImageData(bits.width, bits.height);
    image = { data, pixels: new Uint32Array(data.data.buffer) };
    paint.image = image;
  }
  fillPixels(image.pixels, bits, paint.ink, paint.paper);
  context.putImageData(image.data, 0, 0);
}

/**
 * Paints `bits` on the returned canvas (or `canvas`, given), again whenever
 * `bits` is another picture, and whenever the theme changes.
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

  return { ref };
}
