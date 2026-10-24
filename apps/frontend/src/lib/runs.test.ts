import { describe, expect, it } from 'vitest';
import { placeMessages, RUN_GAP_MS } from './runs';

// Local times, so the days are the device's whatever its time zone.
const at = (day: number, hour: number, minute: number, second = 0) =>
  new Date(2026, 9, day, hour, minute, second).toISOString();
const message = (id: string, sender: string, createdAt: string) => ({
  id,
  sender: { id: sender },
  createdAt,
});
const shape = (messages: ReturnType<typeof message>[]) =>
  placeMessages(messages).map(({ message, startsDay, startsRun }) =>
    [message.id, startsDay ? 'day' : '', startsRun ? 'run' : ''].join(' ')
  );

describe('placeMessages', () => {
  it('starts the first message’s day and run', () => {
    expect(shape([message('a', 'ada', at(21, 9, 0))])).toEqual(['a day run']);
    expect(placeMessages([])).toEqual([]);
  });

  it('keeps one sender’s messages a run while each follows within five minutes', () => {
    expect(
      shape([
        message('a', 'ada', at(21, 9, 0)),
        message('b', 'ada', at(21, 9, 4, 59)),
        message('c', 'ada', at(21, 9, 9, 58)),
        message('d', 'ada', at(21, 9, 15, 0)),
      ])
    ).toEqual(['a day run', 'b  ', 'c  ', 'd  run']);
    expect(RUN_GAP_MS).toBe(5 * 60_000);
  });

  it('keeps a message exactly five minutes after the last in the run', () => {
    expect(
      shape([
        message('a', 'ada', at(21, 9, 0)),
        message('b', 'ada', at(21, 9, 5)),
        message('c', 'ada', at(21, 9, 10, 1)),
      ])
    ).toEqual(['a day run', 'b  ', 'c  run']);
  });

  it('starts a run with each change of sender', () => {
    expect(
      shape([
        message('a', 'ada', at(21, 9, 0)),
        message('b', 'grace', at(21, 9, 1)),
        message('c', 'ada', at(21, 9, 2)),
      ])
    ).toEqual(['a day run', 'b  run', 'c  run']);
  });

  it('starts a day, and a run with it, at each new day', () => {
    expect(
      shape([
        message('a', 'ada', at(20, 23, 58)),
        message('b', 'ada', at(21, 0, 1)),
        message('c', 'ada', at(21, 0, 2)),
        message('d', 'ada', at(23, 8, 0)),
      ])
    ).toEqual(['a day run', 'b day run', 'c  ', 'd day run']);
  });

  it('tells the same date in another month or year from the same day', () => {
    expect(
      shape([
        message('a', 'ada', new Date(2026, 8, 21, 9, 0).toISOString()),
        message('b', 'ada', new Date(2026, 9, 21, 9, 0).toISOString()),
        message('c', 'ada', new Date(2027, 9, 21, 9, 0).toISOString()),
      ])
    ).toEqual(['a day run', 'b day run', 'c day run']);
  });
});
