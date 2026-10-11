import { describe, expect, it } from 'vitest';
import { formatTime } from './time';

describe('formatTime', () => {
  // Measured against the clock it is given, never one of its own.
  it('says how long ago, by the given now', () => {
    const sent = '2026-10-11T12:00:00Z';

    expect(formatTime(sent, new Date('2026-10-11T12:00:30Z'))).toBe('Just now');
    expect(formatTime(sent, new Date('2026-10-11T12:20:00Z'))).toBe('20m ago');
    expect(formatTime(sent, new Date('2026-10-11T15:00:00Z'))).toBe('3h ago');
  });
});
