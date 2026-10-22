import { ServerError, ServerParseError } from '@apollo/client/errors';

/*
 * Reaching the server. Msgr's sleeps when nobody's used it for a while and
 * takes up to a minute to wake; a phone's network comes and goes. Neither
 * means anyone is signed out.
 */

/** What a host, or a proxy in front of it, answers while its server is away or waking. */
const AWAY = new Set([408, 429, 502, 503, 504]);

/**
 * Whether a failed request is worth sending again, unchanged, after a pause:
 * a query that never reached a server able to answer it. That's no network
 * at all (fetch's TypeError), a page in place of the JSON asked for (a host's
 * "waking up" screen), or a proxy saying its server is away. Never a mutation,
 * which may have arrived and done its work; never the server's own answer.
 */
export function isWorthRetrying(
  error: unknown,
  operation: 'query' | 'mutation' | 'subscription'
): boolean {
  if (operation !== 'query') return false;
  if (ServerError.is(error)) return AWAY.has(error.statusCode);
  return ServerParseError.is(error) || error instanceof TypeError;
}

/** How long a wait for the server goes unremarked before it's explained. */
export const QUIET_MS = 1500;

export interface ConnectingNotice {
  readonly title: string;
  readonly detail: string;
  /** Whether asking again is up to the viewer; otherwise it happens by itself. */
  readonly retry: boolean;
}

/**
 * What to say while the app waits to learn who's signed in. Nothing at first,
 * since that's usually over in a moment; then why it's taking a while.
 */
export function connectingNotice({
  online,
  slow,
  failed,
}: {
  /** Whether the device thinks it has a network. */
  online: boolean;
  /** Whether the wait has gone on past a moment (QUIET_MS). */
  slow: boolean;
  /** Whether the server answered, but with an error rather than the viewer. */
  failed: boolean;
}): ConnectingNotice | null {
  if (failed) {
    return {
      title: 'Msgr couldn’t open',
      detail: 'Something went wrong on its side.',
      retry: true,
    };
  }
  if (!online) {
    return {
      title: 'No connection',
      detail: 'Msgr will open when you’re back online.',
      retry: false,
    };
  }
  if (!slow) return null;
  return {
    title: 'Connecting to Msgr…',
    detail: 'If it’s been asleep, this can take up to a minute.',
    retry: false,
  };
}
