import type { Dependencies } from '../application/ports.js';
import { createScope, type Scope } from '../application/scope.js';
import type { Session, SessionToken, User } from '../domain/user.js';
import { unauthenticated } from './errors.js';

export interface Context extends Scope {
  /**
   * The signed-in user, or `null` for an anonymous request. A login or sign-up
   * sets it, so the rest of that operation resolves as the new user.
   */
  viewer: User | null;
  readonly cookie: SessionCookie;
}

/** Persists a login on the transport that carried it. */
export interface SessionCookie {
  set(token: SessionToken): void;
  clear(): void;
}

/** WebSockets cannot set cookies; clients keep the token from `login`. */
export const noCookie: SessionCookie = {
  set: () => undefined,
  clear: () => undefined,
};

export async function createContext(
  deps: Dependencies,
  request: {
    readonly token: string | undefined;
    readonly cookie: SessionCookie;
    readonly cache: boolean;
  }
): Promise<Context> {
  const scope = createScope(deps, { cache: request.cache });
  const viewer = await scope.services.auth.authenticate(request.token);
  return { ...scope, viewer, cookie: request.cookie };
}

/** A login or sign-up succeeded: keep the session, and act as its user from here on. */
export function startSession(ctx: Context, session: Session): void {
  ctx.cookie.set(session.token);
  ctx.viewer = session.user;
}

/** Authorization starts here: every root field that needs a user calls this. */
export function requireViewer({ viewer }: Context): User {
  if (viewer === null) throw unauthenticated();
  return viewer;
}
