import { ServerError, ServerParseError } from '@apollo/client/errors';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  connectionAfter,
  isWorthRetrying,
  type LiveConnection,
  type SocketEvent,
  RECONNECTING_AFTER_MS,
  sessionOf,
  silenceWatch,
  untilReconnectingShows,
  waitOf,
} from './connection';

const response = (status: number) => new Response('', { status });
const serverError = (status: number) =>
  new ServerError('', { response: response(status), bodyText: '' });

describe('isWorthRetrying', () => {
  it('asks again for a query that never reached a server able to answer', () => {
    // No network at all.
    expect(isWorthRetrying(new TypeError('Failed to fetch'), 'query')).toBe(
      true
    );
    // A host's "waking up" page in place of JSON.
    const page = new ServerParseError(new SyntaxError('Unexpected token <'), {
      response: response(200),
      bodyText: '<!doctype html>',
    });
    expect(isWorthRetrying(page, 'query')).toBe(true);
    // A proxy whose server is away.
    for (const status of [502, 503, 504]) {
      expect(isWorthRetrying(serverError(status), 'query')).toBe(true);
    }
  });

  it("takes the server's own answer as given", () => {
    expect(isWorthRetrying(serverError(400), 'query')).toBe(false);
    expect(isWorthRetrying(serverError(500), 'query')).toBe(false);
    expect(isWorthRetrying(new Error('Something went wrong'), 'query')).toBe(
      false
    );
  });

  it('never sends a mutation twice: the first may have arrived', () => {
    expect(isWorthRetrying(new TypeError('Failed to fetch'), 'mutation')).toBe(
      false
    );
    expect(isWorthRetrying(serverError(503), 'mutation')).toBe(false);
  });
});

describe('sessionOf', () => {
  const ada = { id: 'u1', name: 'Ada' };

  it('is in only when the server names someone, and out only when it says nobody', () => {
    expect(sessionOf({ me: ada, admin: null }, false)).toEqual({
      kind: 'in',
      viewer: ada,
      isAdmin: false,
    });
    expect(
      sessionOf({ me: ada, admin: { __typename: 'Admin' } }, false)
    ).toEqual({ kind: 'in', viewer: ada, isAdmin: true });
    expect(sessionOf({ me: null, admin: null }, false)).toEqual({
      kind: 'out',
    });
  });

  it('waits for an answer, however long, and never signs anyone out for want of one', () => {
    expect(sessionOf(undefined, false)).toEqual({
      kind: 'waiting',
      failed: false,
    });
    expect(sessionOf(undefined, true)).toEqual({
      kind: 'waiting',
      failed: true,
    });
  });

  it("keeps someone in while they're asked again, even if that fails", () => {
    expect(sessionOf({ me: ada, admin: null }, true)).toMatchObject({
      kind: 'in',
    });
  });
});

describe('waitOf', () => {
  it('says nothing for a moment, then that the server may be waking', () => {
    expect(waitOf({ online: true, slow: false, failed: false })).toBe('quiet');
    expect(waitOf({ online: true, slow: true, failed: false })).toBe('waking');
  });

  it('says at once when the device has no network, however long it waits', () => {
    expect(waitOf({ online: false, slow: false, failed: false })).toBe(
      'offline'
    );
    expect(waitOf({ online: false, slow: true, failed: false })).toBe(
      'offline'
    );
  });

  it('says at once when the server answered with an error, online or not', () => {
    for (const online of [true, false]) {
      for (const slow of [true, false]) {
        expect(waitOf({ online, slow, failed: true })).toBe('failed');
      }
    }
  });
});

describe('silenceWatch', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('gives up on a socket whose ping goes unanswered', () => {
    const silent = vi.fn();
    const watch = silenceWatch(5_000, silent);
    watch.asked();
    vi.advanceTimersByTime(4_999);
    expect(silent).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(silent).toHaveBeenCalledOnce();
  });

  it('keeps a socket that answers', () => {
    const silent = vi.fn();
    const watch = silenceWatch(5_000, silent);
    watch.asked();
    vi.advanceTimersByTime(3_000);
    watch.answered();
    vi.advanceTimersByTime(10_000);
    expect(silent).not.toHaveBeenCalled();
  });

  it('keeps the first deadline when asked again meanwhile', () => {
    const silent = vi.fn();
    const watch = silenceWatch(5_000, silent);
    watch.asked();
    vi.advanceTimersByTime(3_000);
    watch.asked();
    vi.advanceTimersByTime(2_000);
    expect(silent).toHaveBeenCalledOnce();
    // And watches afresh once it has given up.
    watch.asked();
    vi.advanceTimersByTime(5_000);
    expect(silent).toHaveBeenCalledTimes(2);
  });
});

describe('untilReconnectingShows', () => {
  it('says nothing of a blip, then that it is reconnecting from two seconds down', () => {
    expect(RECONNECTING_AFTER_MS).toBe(2000);
    expect(untilReconnectingShows(1000, 1000)).toBe(2000);
    expect(untilReconnectingShows(1000, 2500)).toBe(500);
    expect(untilReconnectingShows(1000, 3000)).toBe(0);
    expect(untilReconnectingShows(1000, 9000)).toBe(0);
  });
});

describe('connectionAfter', () => {
  const idle: LiveConnection = { kind: 'idle' };
  const up: LiveConnection = { kind: 'up' };
  const connected: SocketEvent = { kind: 'connected' };
  const dropped: SocketEvent = { kind: 'closed', code: 1006 };
  const after = (events: SocketEvent[], from = idle) =>
    events.reduce<LiveConnection>(
      (connection, event, i) => connectionAfter(connection, event, 1000 * i),
      from
    );

  it('goes down when a socket that was up drops, and stays down since then through every failed try', () => {
    expect(after([connected, dropped])).toEqual({ kind: 'down', since: 1000 });
    expect(after([connected, dropped, dropped, dropped])).toEqual({
      kind: 'down',
      since: 1000,
    });
    // A socket taken for dead, terminated by the page, is down too.
    expect(after([connected, { kind: 'closed', code: 4499 }])).toEqual({
      kind: 'down',
      since: 1000,
    });
    // And one closed without a code.
    expect(after([connected, { kind: 'closed', code: null }])).toEqual({
      kind: 'down',
      since: 1000,
    });
    // The server going away as it restarts.
    expect(after([connected, { kind: 'closed', code: 1001 }])).toEqual({
      kind: 'down',
      since: 1000,
    });
  });

  it('is up again once it connects', () => {
    expect(after([connected, dropped, connected])).toEqual(up);
  });

  it('says nothing before it has first been up: that wait is the Connecting screen’s', () => {
    expect(after([dropped, dropped])).toEqual(idle);
  });

  it('has nothing to reconnect once the page closed it on purpose, however it was', () => {
    const closed: SocketEvent = { kind: 'closed', code: 1000 };
    expect(after([connected, closed])).toEqual(idle);
    expect(after([connected, dropped, closed])).toEqual(idle);
    // Signed in again: its first wait is the Connecting screen's.
    expect(after([connected, closed, dropped])).toEqual(idle);
  });

  it('keeps the same state when nothing changed, so nothing listening hears of it', () => {
    expect(connectionAfter(up, connected, 5)).toBe(up);
    expect(connectionAfter(idle, dropped, 5)).toBe(idle);
    const down: LiveConnection = { kind: 'down', since: 1 };
    expect(connectionAfter(down, dropped, 5)).toBe(down);
  });
});
