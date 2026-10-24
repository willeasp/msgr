/** What a browser says of the part of the page on screen (`window.visualViewport`). */
export interface VisualViewportLike {
  readonly height: number;
  readonly offsetTop: number;
  readonly scale: number;
}

/** Where the screen goes: `top` from the page's top, `inset` above its bottom. */
export interface Frame {
  readonly top: number;
  readonly inset: number;
}

export const WHOLE: Frame = { top: 0, inset: 0 };

/**
 * The part of the page a person can see, above a phone's keyboard. iOS lays
 * the keyboard over the page and slides the page up under it, so the screen
 * follows what's visible: `top` the slide, `inset` the keyboard. Pinch-zoomed,
 * the whole page stays as it is, so zooming in still magnifies.
 */
export function visibleFrame(
  innerHeight: number,
  viewport: VisualViewportLike
): Frame {
  if (Math.abs(viewport.scale - 1) > 0.01) return WHOLE;
  const top = Math.max(0, Math.round(viewport.offsetTop));
  const inset = Math.max(
    0,
    Math.round(innerHeight - viewport.height - viewport.offsetTop)
  );
  return top === 0 && inset === 0 ? WHOLE : { top, inset };
}
