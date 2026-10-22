import { describe, expect, it } from 'vitest';
import { formatBytes, share } from './storage-report';

describe('formatBytes', () => {
  it('counts small sizes in bytes', () => {
    expect(formatBytes(0)).toBe('0 bytes');
    expect(formatBytes(1)).toBe('1 byte');
    expect(formatBytes(1023)).toBe('1023 bytes');
  });

  it('counts larger ones in 1,024s, to three figures at most', () => {
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(150 * 1024)).toBe('150 KB');
    expect(formatBytes(512 * 1024 * 1024)).toBe('512 MB');
    expect(formatBytes(2.25 * 1024 ** 3)).toBe('2.3 GB');
  });

  it('moves up a unit when rounding reaches it', () => {
    expect(formatBytes(1024 ** 2 - 1)).toBe('1 MB');
    expect(formatBytes(1023.7 * 1024 ** 2)).toBe('1 GB');
    expect(formatBytes(9.96 * 1024)).toBe('10 KB');
  });
});

describe('share', () => {
  it('is the part of the whole, from 0 to 1', () => {
    expect(share(1, 4)).toBe(0.25);
    expect(share(5, 4)).toBe(1);
    expect(share(1, 0)).toBe(0);
  });
});
