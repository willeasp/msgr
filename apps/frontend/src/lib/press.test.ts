import { describe, expect, it } from 'vitest';
import {
  HELD_AFTER_MS,
  IDLE,
  PRESSED_AFTER_MS,
  pressAfter,
  showsPressed,
  SLOP,
  type Press,
  type PressEvent,
} from './press';

const after = (...events: PressEvent[]) =>
  events.reduce<Press>(pressAfter, IDLE);
const down = { type: 'down', x: 100, y: 200, at: 1000 } as const;

describe('pressAfter', () => {
  it('shows a resting finger as pressed after a moment, and holds it after half a second', () => {
    expect(showsPressed(after(down))).toBe(false);
    expect(
      showsPressed(after(down, { type: 'tick', at: 1000 + PRESSED_AFTER_MS }))
    ).toBe(true);
    expect(
      after(down, { type: 'tick', at: 1000 + HELD_AFTER_MS - 1 }).phase
    ).toBe('pressed');
    expect(after(down, { type: 'tick', at: 1000 + HELD_AFTER_MS }).phase).toBe(
      'held'
    );
  });

  it('lets go of a finger that moves further than a fingertip: scrolling past', () => {
    expect(after(down, { type: 'move', x: 100, y: 200 + SLOP }).phase).toBe(
      'touched'
    );
    expect(after(down, { type: 'move', x: 100, y: 201 + SLOP })).toBe(IDLE);
    expect(
      after(
        down,
        { type: 'tick', at: 1000 + PRESSED_AFTER_MS },
        { type: 'move', x: 100 + SLOP, y: 205 }
      )
    ).toBe(IDLE);
    // Gone, it isn't held however long passes.
    expect(
      after(
        down,
        { type: 'move', x: 150, y: 200 },
        { type: 'tick', at: 1000 + HELD_AFTER_MS }
      )
    ).toBe(IDLE);
  });

  it('is a tap, not a press, when lifted early', () => {
    expect(
      after(down, { type: 'up' }, { type: 'tick', at: 1000 + HELD_AFTER_MS })
    ).toBe(IDLE);
  });

  it('stays held until lifted, wherever the finger goes then', () => {
    const held = after(down, { type: 'tick', at: 1000 + HELD_AFTER_MS });
    expect(pressAfter(held, { type: 'move', x: 0, y: 0 })).toBe(held);
    expect(pressAfter(held, { type: 'tick', at: 99999 })).toBe(held);
    expect(pressAfter(held, { type: 'up' })).toBe(IDLE);
  });

  it('starts again with each finger down', () => {
    const held = after(down, { type: 'tick', at: 1000 + HELD_AFTER_MS });
    expect(pressAfter(held, { ...down, at: 5000 }).phase).toBe('touched');
  });
});
