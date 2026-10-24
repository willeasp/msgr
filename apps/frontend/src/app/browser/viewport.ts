import { visibleFrame, WHOLE, type Frame } from '../../lib/viewport';

/**
 * Keeps `--viewport-top` and `--keyboard-inset` on the page at the part of it
 * a person can see (lib/viewport.ts), so the chats' screen sits between the
 * top and a phone's keyboard, its composer on the keyboard. Android resizes
 * the page for its keyboard itself (`interactive-widget`, index.html); iOS
 * lays its keyboard over the page. Measured only when what's visible changes.
 */
export function followVisualViewport(): () => void {
  const viewport = window.visualViewport;
  if (!viewport) return () => undefined;
  const root = document.documentElement.style;
  let shown: Frame = WHOLE;
  let frame = 0;
  const update = () => {
    frame = 0;
    const next = visibleFrame(window.innerHeight, viewport);
    if (next.top === shown.top && next.inset === shown.inset) return;
    shown = next;
    root.setProperty('--viewport-top', `${next.top}px`);
    root.setProperty('--keyboard-inset', `${next.inset}px`);
  };
  const changed = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  viewport.addEventListener('resize', changed);
  viewport.addEventListener('scroll', changed);
  return () => {
    cancelAnimationFrame(frame);
    viewport.removeEventListener('resize', changed);
    viewport.removeEventListener('scroll', changed);
    root.removeProperty('--viewport-top');
    root.removeProperty('--keyboard-inset');
  };
}
