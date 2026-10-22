import { ServerError, ServerParseError } from '@apollo/client/errors';
import { describe, expect, it } from 'vitest';
import { connectingNotice, isWorthRetrying } from './connection';

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

describe('connectingNotice', () => {
  it('says nothing for a moment, then that the server may be waking', () => {
    expect(
      connectingNotice({ online: true, slow: false, failed: false })
    ).toBeNull();
    expect(
      connectingNotice({ online: true, slow: true, failed: false })
    ).toEqual({
      title: 'Connecting to Msgr…',
      detail: 'If it’s been asleep, this can take up to a minute.',
      retry: false,
    });
  });

  it('says at once when the device has no network, and waits for it', () => {
    expect(
      connectingNotice({ online: false, slow: false, failed: false })
    ).toMatchObject({ title: 'No connection', retry: false });
  });

  it('offers to try again when the server answered with an error', () => {
    expect(
      connectingNotice({ online: true, slow: false, failed: true })
    ).toMatchObject({ title: 'Msgr couldn’t open', retry: true });
  });
});
