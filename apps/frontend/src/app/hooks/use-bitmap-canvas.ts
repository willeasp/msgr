import { useCallback, useEffect, useRef } from 'react';
import type { Bits } from '@msgr/bitmap';
import { inkRuns } from '../../lib/paint';
import { THEME_CHANGED } from '../../lib/theme';

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
