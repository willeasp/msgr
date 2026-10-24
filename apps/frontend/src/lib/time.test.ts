import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { formatClock, formatDay, formatStamp, formatTime } from './time';

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

describe('formatDay', () => {
  const now = new Date(2026, 9, 21, 0, 5);

  it('names a day as a history heads it: today, yesterday, the day, the year', () => {
    expect(formatDay(new Date(2026, 9, 21, 0, 1), now, 'en-US')).toBe('Today');
    expect(formatDay(new Date(2026, 9, 20, 23, 59), now, 'en-US')).toBe(
      'Yesterday'
    );
    expect(formatDay(new Date(2026, 9, 14, 9, 0), now, 'en-US')).toBe(
      'Wed, Oct 14'
    );
    expect(formatDay(new Date(2025, 11, 31, 9, 0), now, 'en-US')).toBe(
      'Dec 31, 2025'
    );
  });

  it('calls a day ahead of the given now today: the server’s clock, or the minute not yet ticked', () => {
    expect(formatDay(new Date(2026, 9, 22, 0, 1), now, 'en-US')).toBe('Today');
  });
});

describe('formatDay, in a time zone that keeps summer time', () => {
  // The device's own zone: days are counted on its calendar.
  const zone = process.env['TZ'];
  beforeEach(() => {
    process.env['TZ'] = 'America/New_York';
  });
  afterEach(() => {
    process.env['TZ'] = zone;
  });

  it('counts the 23-hour day the clocks go forward as a whole day', () => {
    expect(
      formatDay(
        new Date(2026, 2, 8, 12, 0),
        new Date(2026, 2, 9, 0, 30),
        'en-US'
      )
    ).toBe('Yesterday');
  });

  it('counts the 25-hour day the clocks go back as a whole day', () => {
    expect(
      formatDay(
        new Date(2026, 10, 1, 12, 0),
        new Date(2026, 10, 2, 23, 30),
        'en-US'
      )
    ).toBe('Yesterday');
  });
});

describe('formatClock', () => {
  it('says the time of day, to the minute', () => {
    expect(formatClock(new Date(2026, 9, 21, 15, 5), 'en-US')).toMatch(
      /^3:05\sPM$/
    );
    expect(formatClock(new Date(2026, 9, 21, 0, 0), 'en-US')).toMatch(
      /^12:00\sAM$/
    );
  });
});
