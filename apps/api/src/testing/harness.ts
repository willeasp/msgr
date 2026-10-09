import type {
  Clock,
  Dependencies,
  PasswordHasher,
} from '../application/ports.js';
import { createScope } from '../application/scope.js';
import type { Result } from '../domain/result.js';
import type { PasswordHash } from '../domain/user.js';
import { createPubSubMessageEvents } from '../infrastructure/message-events.js';
import { createJwtTokenService } from '../infrastructure/token-service.js';
import { createInMemoryRepositories } from './in-memory-repositories.js';

export const TEST_JWT_SECRET = 'test-secret-that-is-at-least-32-characters';

/** A hasher without bcrypt's cost: the "digest" is just a prefixed password. */
export const fakeHash = (password: string) =>
  `fake-hash:${password}` as PasswordHash;
export const fakePasswordHasher: PasswordHasher = {
  verify: async (password, hash) => hash === fakeHash(password),
};

/** Starts at `start` and advances one second per reading, so ordering is deterministic. */
export function tickingClock(
  start = new Date('2030-01-01T00:00:00.000Z')
): Clock {
  let ticks = 0;
  return () => new Date(start.getTime() + 1000 * ticks++);
}

/** Unwraps an `Ok`, failing the test with the error otherwise. */
export function expectOk<T>(result: Result<T, unknown>): T {
  if (!result.ok) {
    throw new Error(`Expected ok, got ${JSON.stringify(result.error)}`);
  }
  return result.value;
}

/**
 * Waits briefly for a feed's next event. Call it before triggering the
 * event: a feed starts listening on its first `next()`.
 */
export function nextEvent<T>(
  feed: AsyncIterator<T>,
  timeoutMs = 50
): Promise<T | 'nothing'> {
  return Promise.race([
    feed.next().then(({ value }) => value),
    new Promise<'nothing'>((resolve) =>
      setTimeout(() => resolve('nothing'), timeoutMs)
    ),
  ]);
}

/**
 * The whole application over in-memory adapters. Override any port to
 * observe or break it.
 */
export function createTestApp(overrides: Partial<Dependencies> = {}) {
  const { repositories, fixtures } = createInMemoryRepositories();
  const deps: Dependencies = {
    repositories,
    passwords: fakePasswordHasher,
    tokens: createJwtTokenService({ secret: TEST_JWT_SECRET, ttlSeconds: 60 }),
    events: createPubSubMessageEvents(),
    clock: tickingClock(),
    ...overrides,
  };
  return {
    deps,
    fixtures,
    /** Fresh services and loaders, as one request would get them. */
    services: () => createScope(deps, { cache: true }).services,
  };
}
