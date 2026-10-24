import type { Page } from '@playwright/test';

/*
 * A finger on the screen, by Chromium's own touch events: the page sees
 * touches and touch pointers, as on a phone. The phone projects emulate a
 * touch screen (`hasTouch`), which Chromium needs to turn them into pointers.
 */

interface Point {
  x: number;
  y: number;
}

/** A finger put down at `at`, to move and lift. */
export async function finger(page: Page, at: Point) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type: 'touchStart' | 'touchMove', point: Point) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [point] });
  await send('touchStart', at);
  return {
    /** Moves it to `to` in `steps` even steps, as a finger glides. */
    async moveTo(to: Point, steps = 8) {
      const from = { ...at };
      for (let i = 1; i <= steps; i++) {
        at = {
          x: from.x + ((to.x - from.x) * i) / steps,
          y: from.y + ((to.y - from.y) * i) / steps,
        };
        await send('touchMove', at);
      }
    },
    async lift() {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });
      await cdp.detach();
    },
  };
}

/** Holds a finger still at `at` for `ms`, then lifts it. */
export async function hold(page: Page, at: Point, ms: number) {
  const touch = await finger(page, at);
  await page.waitForTimeout(ms);
  await touch.lift();
}

/**
 * Stands in for the browser's visual viewport, so a spec can put up a phone's
 * keyboard: `keyboard(height, slide)` lays one `height` tall over the page,
 * the page slid up `slide` under it, as iOS does. Call before the page loads.
 */
export async function pretendKeyboard(page: Page) {
  await page.addInitScript(() => {
    const state = { keyboard: 0, slide: 0 };
    const viewport = new EventTarget();
    Object.defineProperties(viewport, {
      width: { get: () => window.innerWidth },
      height: { get: () => window.innerHeight - state.keyboard },
      offsetTop: { get: () => state.slide },
      offsetLeft: { get: () => 0 },
      scale: { get: () => 1 },
    });
    Object.defineProperty(window, 'visualViewport', { value: viewport });
    Object.assign(window, {
      keyboard: (height: number, slide = 0) => {
        state.keyboard = height;
        state.slide = slide;
        viewport.dispatchEvent(new Event('resize'));
      },
    });
  });
}

/** Puts up (or, with 0, takes down) the pretend keyboard. */
export const keyboard = (page: Page, height: number, slide = 0) =>
  page.evaluate(
    ([height, slide]) =>
      (
        window as unknown as { keyboard: (h: number, s: number) => void }
      ).keyboard(height, slide),
    [height, slide] as const
  );
