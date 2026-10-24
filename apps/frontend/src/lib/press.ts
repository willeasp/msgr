/*
 * Holding a finger on something, as a phone tells a press from a tap and from
 * scrolling past: still for a moment and it shows as pressed, still for half
 * a second and it's held. Moving it further than a fingertip lets go.
 */

/** How long a finger rests before what's under it shows as pressed. */
export const PRESSED_AFTER_MS = 150;
/** How long it rests before it's held: a long press. */
export const HELD_AFTER_MS = 500;
/** How far a finger may wander and still be pressing, in CSS pixels. */
export const SLOP = 10;

export type Press =
  | { readonly phase: 'idle' }
  /** A finger is down, since `at`, not yet long enough to show. */
  | {
      readonly phase: 'touched';
      readonly x: number;
      readonly y: number;
      readonly at: number;
    }
  /** Still there: what's under it shows as pressed. */
  | {
      readonly phase: 'pressed';
      readonly x: number;
      readonly y: number;
      readonly at: number;
    }
  /** Held: the long press happened, until the finger lifts. */
  | { readonly phase: 'held' };

export type PressEvent =
  | {
      readonly type: 'down';
      readonly x: number;
      readonly y: number;
      readonly at: number;
    }
  | { readonly type: 'move'; readonly x: number; readonly y: number }
  /** Time passing, while the finger rests. */
  | { readonly type: 'tick'; readonly at: number }
  /** Lifted, or taken by the browser to scroll. */
  | { readonly type: 'up' };

export const IDLE: Press = { phase: 'idle' };

/** What a press is after an event. */
export function pressAfter(press: Press, event: PressEvent): Press {
  switch (event.type) {
    case 'down':
      return { phase: 'touched', x: event.x, y: event.y, at: event.at };
    case 'up':
      return IDLE;
    case 'move':
      return press.phase === 'touched' || press.phase === 'pressed'
        ? Math.hypot(event.x - press.x, event.y - press.y) > SLOP
          ? IDLE
          : press
        : press;
    case 'tick': {
      if (press.phase !== 'touched' && press.phase !== 'pressed') return press;
      const rested = event.at - press.at;
      if (rested >= HELD_AFTER_MS) return { phase: 'held' };
      if (rested >= PRESSED_AFTER_MS && press.phase === 'touched') {
        return { ...press, phase: 'pressed' };
      }
      return press;
    }
  }
}

/** Whatever's under the finger shows as pressed. */
export const showsPressed = (press: Press) =>
  press.phase === 'pressed' || press.phase === 'held';
