import { describe, expect, it, vi } from 'vitest';
import { onceEach } from './once';

const offline = () => Promise.reject(new TypeError('Failed to fetch'));

describe('onceEach', () => {
  it('loads each key once, however many ask at the same time', async () => {
    const once = onceEach<string>();
    const load = vi.fn(async () => 'A');

    expect(once.now('a')).toEqual({ state: 'unknown' });
    const [first, second] = await Promise.all([
      once.get('a', load),
      once.get('a', load),
    ]);
    expect([first, second]).toEqual([
      { state: 'here', value: 'A' },
      { state: 'here', value: 'A' },
    ]);
    expect(await once.get('a', load)).toBe(once.now('a'));
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('keeps an answer with nothing in it, and never asks again', async () => {
    const once = onceEach<string>();
    const load = vi.fn(async () => null);

    expect(await once.get('gone', load)).toEqual({ state: 'none' });
    expect(await once.get('gone', load)).toEqual({ state: 'none' });
    once.retry();
    expect(await once.get('gone', load)).toEqual({ state: 'none' });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('remembers a failure until told to retry, then asks again', async () => {
    const once = onceEach<string>();
    const heard = vi.fn();
    once.subscribe(heard);

    expect(await once.get('away', offline)).toEqual({ state: 'failed' });
    expect(once.now('away')).toEqual({ state: 'failed' });
    expect(heard).toHaveBeenCalledTimes(1);

    once.retry();
    expect(once.now('away')).toEqual({ state: 'unknown' });
    expect(heard).toHaveBeenCalledTimes(2);
    expect(await once.get('away', async () => 'back')).toEqual({
      state: 'here',
      value: 'back',
    });
  });

  it('asks again for a failed key whoever asks outright', async () => {
    const once = onceEach<string>();
    await once.get('away', offline);
    expect(await once.get('away', async () => 'back')).toEqual({
      state: 'here',
      value: 'back',
    });
  });

  it('keeps what was made here, whatever a load meanwhile answers', async () => {
    const once = onceEach<string>();
    const heard = vi.fn();
    once.subscribe(heard);
    let answer = (_: string | null) => undefined as void;
    let fail = () => undefined as void;

    const loading = once.get(
      'mine',
      () =>
        new Promise((done, failed) => {
          answer = done;
          fail = () => failed(new TypeError('Failed to fetch'));
        })
    );
    once.put('mine', 'made');
    expect(heard).toHaveBeenCalledTimes(1);
    fail();
    expect(await loading).toEqual({ state: 'here', value: 'made' });
    expect(once.now('mine')).toEqual({ state: 'here', value: 'made' });

    const loaded = once.get(
      'theirs',
      () => new Promise((done) => (answer = done))
    );
    once.put('theirs', 'made');
    answer('fetched');
    expect(await loaded).toEqual({ state: 'here', value: 'made' });
  });

  it('keeps what was made here, without loading it', async () => {
    const once = onceEach<string>();
    const load = vi.fn(async () => 'loaded');
    once.put('mine', 'made');
    expect(await once.get('mine', load)).toEqual({
      state: 'here',
      value: 'made',
    });
    expect(load).not.toHaveBeenCalled();
  });

  it('forgets everything when cleared, even what was on its way', async () => {
    const once = onceEach<string>();
    const heard = vi.fn();
    once.subscribe(heard);
    once.put('a', 'A');
    let answer = (_: string | null) => undefined as void;
    const loading = once.get('b', () => new Promise((done) => (answer = done)));

    once.clear();
    answer('B, for whoever was here before');
    await loading;
    expect(once.now('a')).toEqual({ state: 'unknown' });
    expect(once.now('b')).toEqual({ state: 'unknown' });
    expect(heard).toHaveBeenCalledTimes(2);
  });

  it('says the same object until something changes, as React asks of a store', async () => {
    const once = onceEach<string>();
    expect(once.now('a')).toBe(once.now('b'));
    await once.get('a', async () => 'A');
    expect(once.now('a')).toBe(once.now('a'));
  });

  it('stops telling a listener once it unsubscribes', () => {
    const once = onceEach<string>();
    const heard = vi.fn();
    const stop = once.subscribe(heard);
    stop();
    once.put('a', 'A');
    expect(heard).not.toHaveBeenCalled();
  });
});
