import { describe, expect, it } from 'vitest';
import { formatStamp, formatTime } from './time';

describe('formatTime', () => {
  // Measured against the clock it is given, never one of its own.
  it('says how long ago, by the given now', () => {
    const sent = '2026-10-11T12:00:00Z';

    expect(formatTime(sent, new Date('2026-10-11T12:00:30Z'))).toBe('Just now');
    expect(formatTime(sent, new Date('2026-10-11T12:20:00Z'))).toBe('20m ago');
    expect(formatTime(sent, new Date('2026-10-11T15:00:00Z'))).toBe('3h ago');
  });
});

describe('formatStamp', () => {
  // Local times, so the days are the device's whatever its time zone.
  const now = new Date(2026, 9, 21, 18, 0);

  it('names today and yesterday, then the day, then the year', () => {
    expect(formatStamp(new Date(2026, 9, 21, 15, 5), now, 'en-US')).toMatch(
      /^Today, 3:05\sPM$/
    );
    expect(formatStamp(new Date(2026, 9, 20, 23, 59), now, 'en-US')).toMatch(
      /^Yesterday, 11:59\sPM$/
    );
    expect(formatStamp(new Date(2026, 9, 14, 9, 0), now, 'en-US')).toMatch(
      /^Wed, Oct 14, 9:00\sAM$/
    );
    expect(formatStamp(new Date(2025, 11, 31, 9, 0), now, 'en-US')).toMatch(
      /^Dec 31, 2025, 9:00\sAM$/
    );
  });
});
