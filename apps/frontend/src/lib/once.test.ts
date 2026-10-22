import { describe, expect, it, vi } from 'vitest';
import { onceEach } from './once';

describe('onceEach', () => {
  it('loads each key once, however many ask at the same time', async () => {
    const once = onceEach<string>();
    const load = vi.fn(async () => 'A');

    expect(once.now('a')).toBeUndefined();
    const [first, second] = await Promise.all([
      once.get('a', load),
      once.get('a', load),
    ]);
    expect([first, second]).toEqual(['A', 'A']);
    expect(await once.get('a', load)).toBe('A');
    expect(once.now('a')).toBe('A');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('keeps an answer of null, and forgets a failure to try again', async () => {
    const once = onceEach<string>();

    expect(await once.get('gone', async () => null)).toBeNull();
    expect(once.now('gone')).toBeNull();
    const offline = () => Promise.reject(new TypeError('Failed to fetch'));
    expect(await once.get('away', offline)).toBeNull();
    expect(once.now('away')).toBeUndefined();
    expect(await once.get('away', async () => 'back')).toBe('back');
  });

  it('keeps what was made here, without loading it', async () => {
    const once = onceEach<string>();
    const load = vi.fn(async () => 'loaded');
    once.put('mine', 'made');
    expect(once.now('mine')).toBe('made');
    expect(await once.get('mine', load)).toBe('made');
    expect(load).not.toHaveBeenCalled();
  });
});
