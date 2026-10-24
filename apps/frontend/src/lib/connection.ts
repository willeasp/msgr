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

/** Whether someone is signed in, as far as the app knows yet. */
export type Session<Viewer> =
  | { readonly kind: 'in'; readonly viewer: Viewer; readonly isAdmin: boolean }
  | { readonly kind: 'out' }
  /** No answer yet; `failed` when the server answered with an error instead. */
  | { readonly kind: 'waiting'; readonly failed: boolean };

/**
 * Who's signed in, from the server's latest answer to `GetMe`, or the one
 * before it while it's asked again. Only the server saying nobody is signed in
 * (`me: null`) is signed out: a server that's asleep, out of reach or failing
 * is waited for, and someone already in stays in meanwhile.
 */
export function sessionOf<Viewer>(
  answer:
    | { readonly me?: Viewer | null; readonly admin?: object | null }
    | undefined,
  failed: boolean
): Session<Viewer> {
  if (answer?.me) {
    return { kind: 'in', viewer: answer.me, isAdmin: !!answer.admin };
  }
  return answer ? { kind: 'out' } : { kind: 'waiting', failed };
}

/** Why the app is still waiting to learn who's signed in. */
export type Wait =
  /** Only a moment so far, which is usually all it takes: nothing's said. */
  | 'quiet'
  /** The device has no network; asked again by itself when it's back. */
  | 'offline'
  /** Past a moment (QUIET_MS): the server may be waking. */
  | 'waking'
  /** The server answered with an error; asking again is up to the viewer. */
  | 'failed';

export function waitOf({
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
}): Wait {
  if (failed) return 'failed';
  if (!online) return 'offline';
  return slow ? 'waking' : 'quiet';
}

/** What to say about each wait, but the first. */
export const WAIT_NOTICES: Readonly<
  Record<
    Exclude<Wait, 'quiet'>,
    { readonly title: string; readonly detail: string }
  >
> = {
  offline: {
    title: 'No connection',
    detail: 'Msgr will open when you’re back online.',
  },
  waking: {
    title: 'Connecting to Msgr…',
    detail: 'If it’s been asleep, this can take up to a minute.',
  },
  failed: {
    title: 'Msgr couldn’t open',
    detail: 'Something went wrong on its side.',
  },
};
