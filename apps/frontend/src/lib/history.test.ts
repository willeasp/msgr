import { describe, expect, it } from 'vitest';
import { arrivedSince, firstFrom, hasEarlier, HISTORY_PAGE } from './history';

const ids = (count: number, from = 0) =>
  Array.from({ length: count }, (_, i) => ({ id: `m${from + i}` }));

describe('firstFrom', () => {
  it('finds the chat’s first message in a page short of a whole one', () => {
    expect(firstFrom(ids(3), 'm3')).toBe('m0');
    expect(firstFrom(ids(HISTORY_PAGE - 1), 'm49')).toBe('m0');
  });

  it('takes the message it was asked before when there was nothing before it', () => {
    expect(firstFrom([], 'm0')).toBe('m0');
  });

  it('knows nothing from a whole page', () => {
    expect(firstFrom(ids(HISTORY_PAGE), 'm50')).toBeUndefined();
  });
});

describe('hasEarlier', () => {
  it('asks no further back than a history shorter than a page', () => {
    expect(hasEarlier(ids(HISTORY_PAGE - 1), undefined)).toBe(false);
    expect(hasEarlier([], undefined)).toBe(false);
  });

  it('asks further back from a whole page, until it starts at the chat’s first', () => {
    expect(hasEarlier(ids(HISTORY_PAGE), undefined)).toBe(true);
    expect(hasEarlier(ids(HISTORY_PAGE + 20), 'm0')).toBe(false);
  });

  it('asks again when the history no longer starts at the first it found (it started again)', () => {
    expect(hasEarlier(ids(HISTORY_PAGE, 100), 'm0')).toBe(true);
  });
});

describe('arrivedSince', () => {
  const message = (id: string, sender: string) => ({
    id,
    sender: { id: sender },
  });
  const history = [
    message('a', 'ada'),
    message('b', 'grace'),
    message('c', 'me'),
    message('d', 'ada'),
  ];

  it('counts what others sent after the newest seen', () => {
    expect(arrivedSince(history, 'a', 'me')).toBe(2);
    expect(arrivedSince(history, 'c', 'me')).toBe(1);
    expect(arrivedSince(history, 'd', 'me')).toBe(0);
  });

  it('counts nothing once the one seen is no longer held', () => {
    expect(arrivedSince(history, 'gone', 'me')).toBe(0);
  });
});
