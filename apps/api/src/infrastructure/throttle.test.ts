import { describe, expect, it } from 'vitest';
import { createMemoryThrottle } from './throttle.js';

function clockAt(ms: number) {
  const clock = () => new Date(clock.now);
  clock.now = ms;
  return clock;
}

describe('createMemoryThrottle', () => {
  it('allows `limit` attempts per window, then refuses until the window passes', () => {
    const clock = clockAt(0);
    const throttle = createMemoryThrottle({ limit: 2, windowMs: 1000, clock });

    expect([1, 2, 3].map(() => throttle.attempt('ada'))).toEqual([
      true,
      true,
      false,
    ]);
    clock.now = 999;
    expect(throttle.attempt('ada')).toBe(false);
    clock.now = 1000;
    expect(throttle.attempt('ada')).toBe(true);
  });

  it('counts each key on its own', () => {
    const throttle = createMemoryThrottle({
      limit: 1,
      windowMs: 1000,
      clock: clockAt(0),
    });

    expect(throttle.attempt('ada')).toBe(true);
    expect(throttle.attempt('grace')).toBe(true);
    expect(throttle.attempt('ada')).toBe(false);
  });
});
