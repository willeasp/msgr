import { useCallback, useEffect, useRef, type CSSProperties } from 'react';
import type { Bits } from '@msgr/media';
import { inkRuns } from '../../lib/paint';
import { THEME_CHANGED } from '../../lib/theme';

/** A canvas's size for CSS, which scales its pixels (2× in chats, 1× on phones). */
export const pixelSize = ({ width, height }: Pick<Bits, 'width' | 'height'>) =>
  ({ '--width': width, '--height': height } as CSSProperties);

/**
 * Paints `bits` on the returned canvas in the canvas's own CSS `color` on its
 * `background-color` (the theme's ink and paper), and again whenever the
 * theme changes. Call `repaint` after changing `bits` in place.
 */
export function useBitmapCanvas(bits: Bits) {
  const ref = useRef<HTMLCanvasElement>(null);

  const repaint = useCallback(() => {
    const canvas = ref.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const { color, backgroundColor } = getComputedStyle(canvas);
    context.fillStyle = backgroundColor;
    context.fillRect(0, 0, bits.width, bits.height);
    context.fillStyle = color;
    for (const [x, y, length] of inkRuns(bits)) {
      context.fillRect(x, y, length, 1);
    }
  }, [bits]);

  useEffect(() => {
    repaint();
    window.addEventListener(THEME_CHANGED, repaint);
    return () => window.removeEventListener(THEME_CHANGED, repaint);
  }, [repaint]);

  return { ref, repaint };
}
