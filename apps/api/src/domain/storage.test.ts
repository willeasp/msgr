import { describe, expect, it } from 'vitest';
import { storageReport, type StorageUsage } from './storage.js';

const usage: StorageUsage = {
  databaseBytes: 300,
  tables: [
    { name: 'User', bytes: 10 },
    { name: 'Message', bytes: 200 },
  ],
  contents: [
    { kind: 'text', count: 5, bytes: 50 },
    { kind: 'movie', count: 1, bytes: 120 },
  ],
};

describe('storageReport', () => {
  it("says what's left of the allowance", () => {
    expect(storageReport(usage, 1000)).toMatchObject({
      databaseBytes: 300,
      limitBytes: 1000,
      freeBytes: 700,
    });
  });

  it('never has less than nothing left, and nothing to say without an allowance', () => {
    expect(storageReport(usage, 200).freeBytes).toBe(0);
    expect(storageReport(usage, null)).toMatchObject({
      limitBytes: null,
      freeBytes: null,
    });
  });

  it('lists tables and contents biggest first', () => {
    const report = storageReport(usage, null);
    expect(report.tables.map(({ name }) => name)).toEqual(['Message', 'User']);
    expect(report.contents.map(({ kind }) => kind)).toEqual(['movie', 'text']);
  });
});
